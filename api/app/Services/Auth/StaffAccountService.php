<?php
namespace App\Services\Auth;

use App\Exceptions\BusinessException;
use App\Models\{AccountActivationRequest, AuditLog, Institution, InstitutionRegistration, OtpToken, User};
use App\Rules\PolicyPassword;
use App\Support\{Tenancy, UserAvatar};
use Illuminate\Support\Facades\{DB, Validator};
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** D90 account identity only; never creates or edits employment, payees, memberships or duties. */
class StaffAccountService
{
    private const PURPOSES = ['staff_activation', 'contact_change'];
    public function __construct(private OtpService $otp, private ActivationDelivery $delivery) {}

    public function index(User $actor, int $perPage = 25)
    {
        return $this->locked(function () use ($actor, $perPage) {
            $this->principal($actor, true);
            return User::inTenant()->where('role', 'institution_staff')->orderBy('id')->paginate(max(1, min(100, $perPage)));
        });
    }

    public function create(User $actor, array $input): array
    {
        $this->keys($input, ['name', 'contact']);
        Validator::make($input, ['name' => 'required|string|max:100', 'contact' => 'required|array'])->validate();
        return $this->locked(function ($i) use ($actor, $input) {
            $actor = $this->principal($actor, true);
            [$channel, $contact] = $this->contact($input['contact']);
            $this->uniqueContact($channel, $contact);
            $user = User::create(['institution_id' => $i->id, 'name' => $input['name'], $channel => $contact,
                'role' => 'institution_staff', 'password' => Str::random(64), 'is_active' => false, 'must_change_password' => true]);
            $activation = $this->issue($user, $actor, 'staff_activation');
            $this->audit('staff_account.created', $user, $actor->id);
            return compact('user', 'activation');
        });
    }

    public function update(User $actor, int $id, array $input): array
    {
        $this->keys($input, ['name', 'contact', 'is_active']);
        Validator::make($input, ['name' => 'sometimes|required|string|max:100', 'contact' => 'sometimes|required|array', 'is_active' => 'sometimes|required|boolean'])->validate();
        return $this->locked(function () use ($actor, $id, $input) {
            $actor = $this->principal($actor, true); $user = $this->staff($id);
            $previous = $this->latest($user); $wasActive = $user->is_active;
            $reactivate = array_key_exists('is_active', $input) && (bool) $input['is_active'];
            $deactivate = array_key_exists('is_active', $input) && !(bool) $input['is_active'];
            $changed = false;
            if (isset($input['contact'])) {
                [$channel, $value] = $this->contact($input['contact']);
                $this->uniqueContact($channel, $value, $user->id);
                $other = $channel === 'phone' ? 'email' : 'phone';
                $changed = $user->getAttribute($other) !== null || $this->fingerprint($channel, (string) $user->getAttribute($channel)) !== $this->fingerprint($channel, $value);
                if ($changed) $user->forceFill([$channel => $value, $other => null, 'is_active' => false]);
            }
            if (array_key_exists('name', $input)) $user->name = $input['name'];
            if ($deactivate) $user->is_active = false;
            $user->save();
            $activation = null;
            if ($changed || $deactivate) {
                $this->cancel($user);
                app(TokenService::class)->revokeAll($user);
            }
            // A cancelled/manual-deactivation invitation is never revived by contact editing or resend alone.
            if (!$deactivate && (($changed && ($wasActive || $reactivate || $previous?->status === 'pending')) || ($reactivate && !$user->is_active))) {
                $user->forceFill(['is_active' => false])->save();
                app(TokenService::class)->revokeAll($user);
                $activation = $this->issue($user, $actor, $changed ? 'contact_change' : 'staff_activation');
            }
            $this->audit('staff_account.updated', $user, $actor->id, ['state' => $user->is_active ? 'active' : 'inactive']);
            return compact('user', 'activation');
        });
    }

    public function reissue(User $actor, int $id): void
    {
        $this->locked(function () use ($actor, $id) {
            $actor = $this->principal($actor, true); $user = $this->staff($id); $previous = $this->latest($user);
            if ($user->is_active || !$previous || $previous->status !== 'pending' || !$this->bound($previous, $user)) throw $this->conflict();
            $this->issue($user, $actor, $previous->purpose);
        });
    }

    public function activate(string $publicId, string $code, array $password): array
    {
        $result = $this->locked(function () use ($publicId, $code, $password) {
            $candidate = AccountActivationRequest::where('public_id', $publicId)->whereIn('purpose', self::PURPOSES)->first();
            if (!$candidate) return $this->invalid();
            $user = User::inTenant()->whereKey($candidate->user_id)->lockForUpdate()->first();
            if (!$user || $user->role !== 'institution_staff' || $user->is_active || InstitutionRegistration::where('first_admin_id', $user->id)->exists()) return $this->invalid();
            $request = $this->latest($user);
            if (!$request || !hash_equals($request->public_id, $publicId) || $request->status !== 'pending'
                || !$this->bound($request, $user) || $request->expires_at->lte(now())) return $this->invalid();
            $authorizer = User::inTenant()->whereKey($request->authorized_by)->lockForUpdate()->first();
            if (!$authorizer || !$authorizer->is_active || $authorizer->role !== 'admin' || ($authorizer->locked_until && $authorizer->locked_until->isFuture())) return $this->invalid();
            $token = OtpToken::where('user_id', $user->id)->whereKey($request->otp_token_id)->lockForUpdate()->first();
            if (!$token || $token->used_at || $token->expires_at->lte(now())) return $this->invalid();
            if (!$this->otp->find($user, $this->binding($request), $code, $token->id)) {
                $this->otp->wrongAttempt($user, $token->id);
                return $this->invalid();
            }
            $this->keys($password, ['password', 'password_confirmation']);
            Validator::make($password, ['password' => ['required', 'string', 'max:255', 'confirmed', new PolicyPassword($user)]])->validate();
            $token->forceFill(['used_at' => now()])->save();
            $request->forceFill(['status' => 'consumed', 'contact_verified_at' => now(), 'consumed_at' => now()])->save();
            $user->forceFill(['password' => $password['password'], 'is_active' => true, 'must_change_password' => false])->save();
            app(TokenService::class)->revokeAll($user);
            $this->audit('staff_account.activated', $user, $user->id, ['generation' => $request->generation]);
            return $this->state($request);
        });
        if ($result instanceof BusinessException) throw $result;
        return $result;
    }

    public function updateOwnProfile(User $actor, array $input): User
    {
        $this->keys($input, ['name', 'avatar']);
        Validator::make($input, ['name' => 'sometimes|required|string|max:100', 'avatar' => 'sometimes|required|image|mimes:jpeg,png|max:2048'])->validate();
        $newPath = null;
        try {
            return $this->locked(function () use ($actor, $input, &$newPath) {
                if (in_array('impersonated', $actor->currentAccessToken()?->abilities ?? [], true)) throw $this->forbidden();
                $user = $this->staff($actor->id);
                if (!$user->is_active || ($user->locked_until && $user->locked_until->isFuture())) throw $this->forbidden();
                if (isset($input['name'])) $user->name = $input['name'];
                if (isset($input['avatar'])) {
                    $oldPath = $user->avatar;
                    $newPath = UserAvatar::store($user, $input['avatar']);
                    $user->avatar = $newPath;
                    DB::afterCommit(fn () => UserAvatar::deleteOwned($user, $oldPath));
                }
                $user->save();
                $this->audit('staff_account.profile_updated', $user, $user->id);
                return $user;
            });
        } catch (\Throwable $e) {
            if ($newPath) \Illuminate\Support\Facades\Storage::disk('private')->delete($newPath);
            throw $e;
        }
    }

    private function locked(\Closure $fn): mixed
    {
        $tenant = Tenancy::current() ?? throw $this->forbidden();
        return DB::transaction(function () use ($tenant, $fn) {
            $i = Institution::whereKey($tenant->id)->lockForUpdate()->firstOrFail();
            if ($i->status !== 'active') throw $this->forbidden();
            return Tenancy::as($i, fn () => $fn($i));
        });
    }
    private function principal(User $actor, bool $lock = false): User
    {
        if (!Tenancy::current() || Tenancy::current()->status !== 'active' || in_array('impersonated', $actor->currentAccessToken()?->abilities ?? [], true)) throw $this->forbidden();
        $q = User::inTenant()->whereKey($actor->id);
        $fresh = ($lock ? $q->lockForUpdate() : $q)->first();
        if (!$fresh || !$fresh->is_active || $fresh->role !== 'admin' || ($fresh->locked_until && $fresh->locked_until->isFuture())) throw $this->forbidden();
        return $fresh;
    }
    private function staff(int $id): User
    {
        $user = User::inTenant()->where('role', 'institution_staff')->whereKey($id)->lockForUpdate()->firstOrFail();
        if (InstitutionRegistration::where('first_admin_id', $id)->exists()) abort(404);
        return $user;
    }
    private function latest(User $user): ?AccountActivationRequest
    {
        return AccountActivationRequest::where('user_id', $user->id)->whereIn('purpose', self::PURPOSES)->orderByDesc('generation')->lockForUpdate()->first();
    }
    private function cancel(User $user): void
    {
        AccountActivationRequest::where('user_id', $user->id)->whereIn('purpose', self::PURPOSES)->whereIn('status', ['pending', 'verified'])->update(['status' => 'cancelled']);
        OtpToken::where('user_id', $user->id)->whereNull('used_at')->update(['used_at' => now()]);
    }
    private function issue(User $user, User $actor, string $purpose): array
    {
        if (!in_array($purpose, self::PURPOSES, true)) throw $this->invalid();
        [$channel, $contact] = $this->currentContact($user);
        $generation = ($this->latest($user)?->generation ?? 0) + 1;
        $this->cancel($user);
        $request = AccountActivationRequest::create(['user_id' => $user->id, 'public_id' => (string) Str::uuid(), 'purpose' => $purpose,
            'generation' => $generation, 'channel' => $channel, 'contact_hash' => $this->fingerprint($channel, $contact),
            'authorized_by' => $actor->id, 'status' => 'pending', 'expires_at' => now()->addMinutes(config('auth_policy.otp.minutes'))]);
        [$token, $code] = $this->otp->issue($user, $this->binding($request));
        $request->forceFill(['otp_token_id' => $token->id])->save();
        $i = Tenancy::current(); $tracking = $this->state($request);
        DB::afterCommit(function () use ($i, $user, $request, $channel, $contact, $code, $tracking) {
            try { $sent = $this->delivery->deliver($channel, $contact, $code, $tracking); } catch (\Throwable) { $sent = false; }
            if (!$sent) Tenancy::as($i, fn () => $this->audit('activation.delivery_pending', $user, $user->id, ['generation' => $request->generation]));
        });
        $this->audit('staff_account.activation_issued', $user, $actor->id, ['generation' => $generation, 'purpose' => $purpose]);
        return $tracking + ['delivery_pending' => true];
    }
    private function bound(AccountActivationRequest $r, User $u): bool
    {
        if (!in_array($r->purpose, self::PURPOSES, true) || $r->generation < 1 || $r->user_id !== $u->id || $r->institution_id !== $u->institution_id) return false;
        try { [$channel, $contact] = $this->currentContact($u); } catch (BusinessException|\Illuminate\Validation\ValidationException) { return false; }
        return $r->channel === $channel && hash_equals($r->contact_hash, $this->fingerprint($channel, $contact));
    }
    private function currentContact(User $user): array
    {
        if ((bool) $user->email === (bool) $user->phone) throw $this->conflict();
        return $this->contact(['channel' => $user->email ? 'email' : 'phone', 'value' => $user->email ?: $user->phone]);
    }
    private function contact(array $contact): array
    {
        $this->keys($contact, ['channel', 'value']);
        Validator::make($contact, ['channel' => 'required|in:phone,email', 'value' => 'required|string|max:100'])->validate();
        $channel = $contact['channel']; $value = $channel === 'phone' ? User::normalisePhone($contact['value']) : mb_strtolower(trim($contact['value']));
        Validator::make(['value' => $value], ['value' => $channel === 'phone' ? ['required', 'regex:/^01[3-9]\d{8}$/'] : ['required', 'email', 'max:100']])->validate();
        return [$channel, $value];
    }
    private function uniqueContact(string $channel, string $contact, ?int $id = null): void
    {
        Validator::make(['contact' => $contact], ['contact' => [Rule::unique('users', $channel)->where('institution_id', Tenancy::current()->id)->ignore($id) ]])->validate();
    }
    private function fingerprint(string $channel, string $value): string
    {
        $key = config('app.key'); if (!is_string($key) || $key === '') throw new \LogicException('Activation key is not configured');
        $value = $channel === 'phone' ? User::normalisePhone($value) : mb_strtolower(trim($value));
        return hash_hmac('sha256', $channel.'|'.$value, $key);
    }
    private function binding(AccountActivationRequest $r): string { return implode('|', [$r->purpose, $r->public_id, $r->generation, $r->channel, $r->contact_hash]); }
    private function state(AccountActivationRequest $r): array { return ['institution_id' => $r->institution_id, 'public_id' => $r->public_id, 'generation' => $r->generation, 'status' => $r->status]; }
    private function keys(array $input, array $allowed): void { if (array_diff(array_keys($input), $allowed)) throw $this->invalid(); }
    private function audit(string $event, User $subject, int $by, array $data = []): void
    {
        AuditLog::create(['institution_id' => $subject->institution_id, 'user_id' => $by, 'action' => $event, 'model' => 'User', 'model_id' => $subject->id, 'new_data' => $data ?: null, 'ip_address' => request()?->ip()]);
    }
    private function forbidden(): BusinessException { return new BusinessException(__('errors.forbidden'), 'forbidden', 403); }
    private function invalid(): BusinessException { return new BusinessException(__('errors.activation_invalid'), 'activation_invalid'); }
    private function conflict(): BusinessException { return new BusinessException(__('errors.activation_conflict'), 'activation_conflict', 409); }
}

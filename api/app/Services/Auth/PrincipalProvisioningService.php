<?php

namespace App\Services\Auth;

use App\Exceptions\BusinessException;
use App\Models\{AccountActivationRequest, AuditLog, Institution, InstitutionRegistration, OtpToken, User};
use App\Rules\PolicyPassword;
use App\Services\OnboardingService;
use App\Support\Tenancy;
use Illuminate\Support\Facades\{DB, Validator};
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** D90 principal lifecycle only. No public route, token, staff grant or shared-data backfill. */
class PrincipalProvisioningService
{
    private const PURPOSE = 'principal_activation';

    public function __construct(private OtpService $otp, private ActivationDelivery $delivery, private OnboardingService $onboarding) {}

    /** Public callers supply their own password; a provisioner cannot choose the recipient's password. */
    public function provision(array $institution, array $principal, ?User $provisioner = null): array
    {
        $this->keys($institution, ['name', 'slug', 'institution_type', 'phone', 'email', 'address']);
        $this->keys($principal, $provisioner ? ['name', 'contact'] : ['name', 'contact', 'password', 'password_confirmation']);
        Validator::make($institution, [
            'name' => 'required|string|max:150',
            'slug' => ['required', 'string', 'min:3', 'max:50', 'regex:/^[a-z0-9]+(-[a-z0-9]+)*$/', Rule::notIn(config('tenancy.reserved_slugs')), 'unique:institutions,slug'],
            'institution_type' => ['required', Rule::in(['school', 'college', 'coaching', 'private_batch'])],
            'phone' => 'nullable|string|max:20', 'email' => 'nullable|email|max:100', 'address' => 'nullable|string|max:500',
        ])->validate();
        Validator::make($principal, ['name' => 'required|string|max:100', 'contact' => 'required|array'])->validate();
        [$channel, $contact] = $this->contact($principal['contact']);
        $candidate = new User(['name' => $principal['name'], 'role' => 'admin', $channel => $contact]);
        if (!$provisioner) $this->password($candidate, array_intersect_key($principal, array_flip(['password', 'password_confirmation'])));

        return DB::transaction(function () use ($institution, $principal, $provisioner, $channel, $contact) {
            if ($provisioner) $this->reviewer($provisioner->id);
            $i = Institution::create($institution + ['status' => 'inactive']);
            $this->onboarding->applyDefaults($i);
            return Tenancy::as($i, function () use ($i, $principal, $provisioner, $channel, $contact) {
                $user = User::create(['institution_id' => $i->id, 'name' => $principal['name'], $channel => $contact,
                    'password' => $provisioner ? Str::random(64) : $principal['password'], 'role' => 'admin',
                    'is_active' => false, 'must_change_password' => (bool) $provisioner]);
                InstitutionRegistration::create(['first_admin_id' => $user->id, 'source' => $provisioner ? 'super_admin' : 'public',
                    'review_status' => $provisioner ? 'approved' : 'pending', 'reviewed_by' => $provisioner?->id,
                    'reviewed_at' => $provisioner ? now() : null]);
                $this->audit('institution.created', $i, $provisioner?->id ?? $user->id, ['type' => $i->institution_type, 'state' => 'inactive']);
                return $this->issue($i, $user, $channel, $contact, $provisioner?->id);
            });
        });
    }

    /** The caller must later give the same generic response for known and unknown resend requests. */
    public function resend(int $institutionId, string $publicId, array $contact): ?array
    {
        [$channel, $value] = $this->contact($contact);
        return $this->locked($institutionId, function ($i, $registration, $user) use ($publicId, $channel, $value) {
            $request = $this->latest($user);
            if (!$request || !hash_equals($request->public_id, $publicId) || $i->status !== 'inactive' || $user->is_active
                || $registration->review_status === 'rejected' || !in_array($request->status, ['pending', 'verified', 'expired'], true)
                || $request->channel !== $channel || !hash_equals($request->contact_hash, $this->fingerprint($channel, $value))
                || !$this->bound($request, $user)) return null;
            return $this->issue($i, $user, $channel, $value, $request->authorized_by);
        }, null);
    }

    public function verify(int $institutionId, string $publicId, string $code, ?array $recipientPassword = null): array
    {
        // Returning a refusal from inside the transaction commits wrong-attempt invalidation.
        $result = $this->locked($institutionId, function ($i, $registration, $user) use ($publicId, $code, $recipientPassword) {
            $request = $this->latest($user);
            if (!$request || !hash_equals($request->public_id, $publicId) || $request->status !== 'pending'
                || $i->status !== 'inactive' || $user->is_active || $user->role !== 'admin'
                || !in_array($registration->source, ['public', 'super_admin'], true)
                || !in_array($registration->review_status, ['pending', 'approved'], true)
                || !$this->bound($request, $user) || $request->expires_at->lte(now())) return $this->invalid();
            $token = OtpToken::where('user_id', $user->id)->whereKey($request->otp_token_id)->lockForUpdate()->first();
            if (!$token || $token->used_at || $token->expires_at->lte(now())) return $this->invalid();
            if (!$this->otp->find($user, $this->binding($request), $code, $token->id)) {
                $this->otp->wrongAttempt($user, $token->id);
                return $this->invalid();
            }
            if ($registration->source === 'super_admin') {
                $this->password($user, $recipientPassword ?? []);
                $user->forceFill(['password' => $recipientPassword['password'], 'must_change_password' => false])->save();
            } elseif ($recipientPassword !== null) {
                return $this->invalid();
            }
            $token->forceFill(['used_at' => now()])->save();
            $request->forceFill(['status' => 'verified', 'contact_verified_at' => now()])->save();
            $this->audit('activation.verified', $request, $user->id, ['generation' => $request->generation]);
            if ($registration->review_status === 'approved') $this->activate($i, $registration, $user, $request);
            return $this->state($i, $request);
        }, $this->invalid());
        if ($result instanceof BusinessException) throw $result;
        return $result;
    }

    public function review(int $institutionId, User $actor, string $decision, ?string $reason = null): array
    {
        Validator::make(['decision' => $decision, 'reason' => $reason], [
            'decision' => 'required|in:approve,reject', 'reason' => 'required_if:decision,reject|nullable|string|max:255',
        ])->validate();
        $result = $this->locked($institutionId, function ($i, $registration, $user) use ($actor, $decision, $reason) {
            $this->reviewer($actor->id);
            $request = $this->latest($user);
            if ($registration->source !== 'public' || !$request) throw $this->conflict();
            $target = $decision === 'approve' ? 'approved' : 'rejected';
            if ($registration->review_status !== 'pending') {
                if ($registration->review_status === $target
                    && ($target === 'rejected' ? $registration->rejection_reason === $reason
                        : $i->status === 'active' && $user->is_active && $request->status === 'consumed' && $this->bound($request, $user))) {
                    return $this->state($i, $request);
                }
                throw $this->conflict();
            }
            if ($i->status !== 'inactive' || $user->is_active || $user->role !== 'admin') throw $this->conflict();
            if ($decision === 'approve' && (!$this->bound($request, $user) || $request->status !== 'verified' || !$request->contact_verified_at)) throw $this->conflict();
            $registration->forceFill(['review_status' => $target, 'reviewed_by' => $actor->id, 'reviewed_at' => now(),
                'rejection_reason' => $decision === 'reject' ? $reason : null])->save();
            if ($decision === 'approve') $this->activate($i, $registration, $user, $request);
            else {
                $request->forceFill(['status' => 'cancelled'])->save();
                OtpToken::where('user_id', $user->id)->whereKey($request->otp_token_id)->whereNull('used_at')->update(['used_at' => now()]);
                app(TokenService::class)->revokeAll($user);
            }
            $this->audit('institution.registration_reviewed', $registration, $actor->id, ['state' => $target]);
            return $this->state($i, $request);
        }, $this->conflict());
        if ($result instanceof BusinessException) throw $result;
        return $result;
    }

    private function locked(int $id, \Closure $operation, mixed $missing = null): mixed
    {
        return DB::transaction(function () use ($id, $operation, $missing) {
            $i = Institution::whereKey($id)->lockForUpdate()->first();
            if (!$i) return $missing;
            return Tenancy::as($i, function () use ($i, $operation, $missing) {
                $registration = InstitutionRegistration::where('institution_id', $i->id)->lockForUpdate()->first();
                if (!$registration) return $missing;
                $user = User::where('institution_id', $i->id)->whereKey($registration->first_admin_id)->lockForUpdate()->first();
                return $user ? $operation($i, $registration, $user) : $missing;
            });
        });
    }

    private function latest(User $user): ?AccountActivationRequest
    {
        return AccountActivationRequest::where('user_id', $user->id)->where('purpose', self::PURPOSE)
            ->orderByDesc('generation')->lockForUpdate()->first();
    }

    private function issue(Institution $i, User $user, string $channel, string $contact, ?int $by): array
    {
        $previous = $this->latest($user);
        AccountActivationRequest::where('user_id', $user->id)->where('purpose', self::PURPOSE)
            ->whereIn('status', ['pending', 'verified'])->update(['status' => 'cancelled']);
        $request = AccountActivationRequest::create(['user_id' => $user->id, 'public_id' => (string) Str::uuid(),
            'purpose' => self::PURPOSE, 'generation' => ($previous?->generation ?? 0) + 1, 'channel' => $channel,
            'contact_hash' => $this->fingerprint($channel, $contact), 'authorized_by' => $by,
            'status' => 'pending', 'expires_at' => now()->addMinutes(config('auth_policy.otp.minutes'))]);
        [$token, $code] = $this->otp->issue($user, $this->binding($request));
        $request->forceFill(['otp_token_id' => $token->id])->save();
        $delivery = (object) ['sent' => false];
        DB::afterCommit(function () use ($i, $request, $channel, $contact, $code, $delivery) {
            try { $delivery->sent = $this->delivery->send($channel, $contact, $code); }
            catch (\Throwable) { $delivery->sent = false; } // transport exceptions can contain credentials; never log/rethrow them.
            if (!$delivery->sent) Tenancy::as($i, fn () => $this->audit('activation.delivery_pending', $request, $request->user_id, ['generation' => $request->generation]));
        });
        $this->audit('activation.issued', $request, $by ?? $user->id, ['generation' => $request->generation]);
        // This value reflects durable pending proof, not a claim that a message was delivered.
        return $this->state($i, $request) + ['delivery_pending' => true];
    }

    private function activate(Institution $i, InstitutionRegistration $registration, User $user, AccountActivationRequest $request): void
    {
        if ($registration->review_status !== 'approved' || $registration->first_admin_id !== $user->id
            || $i->status !== 'inactive' || $user->is_active || $request->status !== 'verified'
            || !$request->contact_verified_at || !$this->bound($request, $user)) throw $this->conflict();
        $user->forceFill(['is_active' => true, 'must_change_password' => false])->save();
        $i->forceFill(['status' => 'active'])->save();
        $request->forceFill(['status' => 'consumed', 'consumed_at' => now()])->save();
        $this->audit('institution.activated', $i, $user->id);
    }

    private function bound(AccountActivationRequest $request, User $user): bool
    {
        if ($request->purpose !== self::PURPOSE || $request->generation < 1
            || $request->institution_id !== $user->institution_id || $request->user_id !== $user->id
            || !in_array($request->channel, ['phone', 'email'], true) || $user->deleted_at) return false;
        $other = $request->channel === 'phone' ? 'email' : 'phone';
        $value = $user->getAttribute($request->channel);
        return !$user->getAttribute($other) && is_string($value) && $value !== ''
            && hash_equals($request->contact_hash, $this->fingerprint($request->channel, $value));
    }

    private function binding(AccountActivationRequest $request): string
    {
        return implode('|', [$request->purpose, $request->public_id, $request->generation, $request->channel, $request->contact_hash]);
    }

    private function fingerprint(string $channel, string $value): string
    {
        $value = $channel === 'phone' ? User::normalisePhone($value) : mb_strtolower(trim($value));
        $key = config('app.key');
        if (!is_string($key) || $key === '') throw new \LogicException('Activation key is not configured');
        return hash_hmac('sha256', $channel.'|'.$value, $key);
    }

    private function contact(array $contact): array
    {
        $this->keys($contact, ['channel', 'value']);
        Validator::make($contact, ['channel' => 'required|in:phone,email', 'value' => 'required|string|max:100'])->validate();
        $channel = $contact['channel'];
        $value = $channel === 'phone' ? User::normalisePhone($contact['value']) : mb_strtolower(trim($contact['value']));
        Validator::make(['value' => $value], ['value' => $channel === 'phone' ? ['required', 'regex:/^01[3-9]\d{8}$/'] : ['required', 'email', 'max:100']])->validate();
        return [$channel, $value];
    }

    private function password(User $user, array $input): void
    {
        $this->keys($input, ['password', 'password_confirmation']);
        Validator::make($input, ['password' => ['required', 'string', 'max:255', 'confirmed', new PolicyPassword($user)]])->validate();
    }

    private function keys(array $input, array $allowed): void
    {
        if (array_diff(array_keys($input), $allowed)) throw $this->invalid();
    }

    private function reviewer(int $id): User
    {
        $actor = User::platform()->whereKey($id)->lockForUpdate()->first();
        if (!$actor || !$actor->is_active || $actor->role !== 'super_admin') throw new BusinessException('Forbidden', 'forbidden', 403);
        return $actor;
    }

    private function state(Institution $i, AccountActivationRequest $request): array
    {
        return ['institution_id' => $i->id, 'public_id' => $request->public_id, 'generation' => $request->generation, 'status' => $request->status];
    }

    private function audit(string $action, \Illuminate\Database\Eloquent\Model $subject, int $by, array $data = []): void
    {
        AuditLog::create(['institution_id' => $subject instanceof Institution ? $subject->id : $subject->institution_id,
            'user_id' => $by, 'action' => $action, 'model' => class_basename($subject), 'model_id' => $subject->getKey(),
            'new_data' => $data ?: null, 'ip_address' => request()?->ip()]);
    }

    private function invalid(): BusinessException { return new BusinessException(__('errors.activation_invalid'), 'activation_invalid'); }
    private function conflict(): BusinessException { return new BusinessException(__('errors.activation_conflict'), 'activation_conflict', 409); }
}

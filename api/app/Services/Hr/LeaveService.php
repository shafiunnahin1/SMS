<?php

namespace App\Services\Hr;

use App\Exceptions\BusinessException;
use App\Jobs\SendSmsJob;
use App\Models\{AuditLog, LeaveApplication, LeaveType, StaffMember, Teacher, User};
use App\Support\Tenancy;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class LeaveService
{
    public function __construct(private HrCalendar $calendar) {}

    private function actor(User $actor): User
    {
        $fresh = User::whereKey($actor->id)->where('institution_id', Tenancy::current()->id)->where('is_active', true)->first();
        if (!$fresh || !in_array($fresh->role, ['admin','teacher'], true)) throw new AuthorizationException();
        if (request()->attributes->get('impersonator_id')) throw new AuthorizationException();
        return $fresh;
    }

    public function payee(?int $userId, ?int $staffId): Teacher|StaffMember
    {
        if (($userId !== null) === ($staffId !== null)) $this->invalid('user_id');
        if ($staffId !== null) return StaffMember::findOrFail($staffId);
        $user = User::whereKey($userId)->where('institution_id', Tenancy::current()->id)->where('role', 'teacher')->where('is_active', true)->firstOrFail();
        return Teacher::where('user_id', $user->id)->firstOrFail();
    }

    private function invalid(string $field): never
    {
        throw ValidationException::withMessages([$field => __('hr.invalid')]);
    }

    private function dates(array $input): array
    {
        $dates = $this->calendar->dates($input['from_date'], $input['to_date']);
        if (!$dates) $this->invalid('from_date');
        return $dates;
    }

    private function query(?int $userId, ?int $staffId)
    {
        return LeaveApplication::where('user_id', $userId)->where('staff_id', $staffId);
    }

    public function snapshot(LeaveApplication $leave): array
    {
        $audit = AuditLog::where('model', 'LeaveApplication')->where('model_id', $leave->id)
            ->where('action', 'leave.approved')->orderByDesc('id')->first();
        $data = $audit?->new_data;
        if (!is_array($data) || !isset($data['dates'], $data['is_paid'])) {
            throw new BusinessException(__('hr.snapshot_missing'), 'leave_snapshot_missing', 409);
        }
        return $data;
    }

    public function consumed(?int $userId, ?int $staffId, int $type, int $year): int
    {
        $count = 0;
        foreach ($this->query($userId, $staffId)->where('leave_type_id', $type)->where('status', 'approved')
            ->where('from_date', '<=', $year.'-12-31')->where('to_date', '>=', $year.'-01-01')->get() as $leave) {
            $count += count(array_filter($this->snapshot($leave)['dates'], fn ($date) => (int) substr($date, 0, 4) === $year));
        }
        return $count;
    }

    private function check(array $input, array $dates, LeaveType $type, User $actor, ?int $exclude = null): void
    {
        $overlap = $this->query($input['user_id'] ?? null, $input['staff_id'] ?? null)
            ->whereIn('status', ['pending','approved'])->where('from_date', '<=', $input['to_date'])
            ->where('to_date', '>=', $input['from_date'])->when($exclude, fn ($q) => $q->where('id', '!=', $exclude))->exists();
        if ($overlap) $this->invalid('from_date');
        $override = $input['override'] ?? false;
        if ($override && ($actor->role !== 'admin' || !trim($input['override_reason'] ?? ''))) $this->invalid('override_reason');
        foreach (array_count_values(array_map(fn ($d) => (int) substr($d, 0, 4), $dates)) as $year => $count) {
            if ($this->consumed($input['user_id'] ?? null, $input['staff_id'] ?? null, $type->id, $year) + $count > (int) $type->max_days_per_year && !$override) {
                $this->invalid('leave_type_id');
            }
        }
    }

    public function create(array $input, User $actor): LeaveApplication
    {
        return DB::transaction(function () use ($input, $actor) {
            Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            $actor = $this->actor($actor);
            if ($actor->role === 'teacher' && ((int) ($input['user_id'] ?? 0) !== $actor->id || isset($input['staff_id']))) throw new AuthorizationException();
            $this->payee($input['user_id'] ?? null, $input['staff_id'] ?? null);
            $type = LeaveType::findOrFail($input['leave_type_id']);
            $dates = $this->dates($input);
            $this->check($input, $dates, $type, $actor);
            $row = LeaveApplication::create(array_intersect_key($input, array_flip(['user_id','staff_id','leave_type_id','from_date','to_date','reason'])) +
                ['total_days' => count($dates), 'status' => 'pending']);
            $this->audit('leave.requested', $row, ['actor_id' => $actor->id, 'override' => $input['override'] ?? false,
                'override_reason' => $input['override_reason'] ?? null]);
            $this->notify($row, 'requested');
            return $row;
        });
    }

    public function transition(int $id, string $action, array $input, User $actor): LeaveApplication
    {
        return DB::transaction(function () use ($id, $action, $input, $actor) {
            Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            $actor = $this->actor($actor);
            $row = LeaveApplication::findOrFail($id);
            if ($actor->role === 'teacher') {
                if ((int) $row->user_id !== $actor->id) abort(404);
                if ($action !== 'cancel') throw new AuthorizationException();
            }
            $state = ['approve' => 'approved', 'reject' => 'rejected', 'cancel' => 'cancelled'][$action] ?? null;
            if (!$state) $this->invalid('action');
            $reason = trim($input['reason'] ?? '');
            if ($row->status === $state) {
                $audit = AuditLog::where('model', 'LeaveApplication')->where('model_id', $row->id)->where('action', 'leave.'.$state)->orderByDesc('id')->first();
                if (($audit?->new_data['actor_id'] ?? null) === $actor->id &&
                    ($audit?->new_data['reason'] ?? '') === $reason &&
                    ($audit?->new_data['override'] ?? false) === ($input['override'] ?? false) &&
                    ($audit?->new_data['override_reason'] ?? '') === ($input['override_reason'] ?? '')) return $row;
                throw new BusinessException(__('hr.conflict'), 'leave_conflict', 409);
            }
            if ($row->status !== 'pending' && !($state === 'cancelled' && $row->status === 'approved' && $actor->role === 'admin' && now()->toDateString() < $row->from_date->toDateString())) {
                throw new BusinessException(__('hr.conflict'), 'leave_conflict', 409);
            }
            if ($state === 'cancelled' && !$reason) $this->invalid('reason');
            $data = ['actor_id' => $actor->id, 'reason' => $reason, 'override' => $input['override'] ?? false,
                'override_reason' => $input['override_reason'] ?? ''];
            if ($state === 'approved') {
                $type = LeaveType::findOrFail($row->leave_type_id);
                $candidate = ['user_id' => $row->user_id, 'staff_id' => $row->staff_id, 'from_date' => $row->from_date->toDateString(),
                    'to_date' => $row->to_date->toDateString()] + $input;
                $dates = $this->dates($candidate);
                $this->check($candidate, $dates, $type, $actor, $row->id);
                $row->total_days = count($dates); $row->approved_by = $actor->id;
                $data += ['dates' => $dates, 'is_paid' => (bool) $type->is_paid];
            }
            $row->status = $state; $row->save();
            $this->audit('leave.'.$state, $row, $data);
            $this->notify($row, $state);
            return $row;
        });
    }

    private function audit(string $action, LeaveApplication $row, array $data): void
    {
        AuditLog::create(['institution_id' => $row->institution_id, 'user_id' => $data['actor_id'],
            'action' => $action, 'model' => 'LeaveApplication', 'model_id' => $row->id, 'new_data' => $data]);
    }

    private function notify(LeaveApplication $row, string $state): void
    {
        $people = $state === 'requested' ? User::where('institution_id', Tenancy::current()->id)->where('role', 'admin')->where('is_active', true)->get() :
            ($row->user_id ? User::where('institution_id', Tenancy::current()->id)->whereKey($row->user_id)->get() : collect([StaffMember::find($row->staff_id)]));
        foreach ($people->filter() as $person) {
            if (!$person->phone || !(($person->notification_preferences ?? [])['sms'] ?? true)) continue;
            SendSmsJob::dispatch($person->phone, __('hr.sms_'.$state, [], $person->locale ?? Tenancy::current()->default_language ?? 'bn'),
                Tenancy::current()->id, null, true)->afterCommit();
        }
    }
}

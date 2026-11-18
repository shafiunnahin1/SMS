<?php

namespace App\Services\OnlineClass;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Batch, OnlineClass, Student, Teacher, User};
use App\Notifications\GeneralNotification;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

// D231 OCL.1 (docs/modules/online-class.md): every admin and teacher may schedule a class for a batch or a whole program; a
// teacher changes, completes or cancels only the classes they teach, the admin (and staff with staff.online_class.manage) any.
// Creating, re-timing or cancelling sends an in-app notice to the class's students and their parents (no SMS, no push).
class OnlineClassService
{
    public function teacherOf(User $u): ?Teacher
    {
        return $u->role === 'teacher' ? Teacher::where('user_id', $u->id)->first() : null;
    }

    public function mayChange(User $u, OnlineClass $c): bool
    {
        if (in_array($u->role, ['admin', 'institution_staff'], true)) return true;
        return ($t = $this->teacherOf($u)) !== null && (int) $t->id === (int) $c->teacher_id;
    }

    public function create(array $f, User $by): OnlineClass
    {
        $c = DB::transaction(function () use ($f) {
            $c = OnlineClass::create($f + ['status' => 'scheduled']);
            AuditLog::record('online_class.created', $c);
            return $c;
        });
        $this->notify($c, 'online_class_scheduled', __('online_class.scheduled_title'), __('online_class.scheduled_body', ['title' => $c->title, 'at' => $this->when($c)]));
        return $c;
    }

    public function update(OnlineClass $c, array $f): OnlineClass
    {
        if (in_array($c->status, ['completed', 'cancelled'], true)) throw new BusinessException(__('online_class.closed'), 'online_class_closed', 409);
        $retimed = (isset($f['scheduled_at']) && !$c->scheduled_at->equalTo(\Illuminate\Support\Carbon::parse($f['scheduled_at'])))
            || (isset($f['duration_minutes']) && (int) $f['duration_minutes'] !== (int) $c->duration_minutes);
        $c->update($f);
        AuditLog::record('online_class.updated', $c);
        if ($retimed) $this->notify($c, 'online_class_retimed', __('online_class.retimed_title'), __('online_class.retimed_body', ['title' => $c->title, 'at' => $this->when($c)]));
        return $c->fresh();
    }

    public function cancel(OnlineClass $c): OnlineClass
    {
        if (in_array($c->status, ['completed', 'cancelled'], true)) throw new BusinessException(__('online_class.closed'), 'online_class_closed', 409);
        $c->update(['status' => 'cancelled']);
        AuditLog::record('online_class.cancelled', $c);
        $this->notify($c, 'online_class_cancelled', __('online_class.cancelled_title'), __('online_class.cancelled_body', ['title' => $c->title, 'at' => $this->when($c)]));
        return $c;
    }

    public function complete(OnlineClass $c, ?string $recording): OnlineClass
    {
        if ($c->status === 'cancelled') throw new BusinessException(__('online_class.closed'), 'online_class_closed', 409);
        if ($c->scheduled_at->isFuture()) throw new BusinessException(__('online_class.not_started'), 'online_class_not_started', 422);
        $c->update(['status' => 'completed', 'recording_url' => $recording ?? $c->recording_url]);
        AuditLog::record('online_class.completed', $c);
        return $c;
    }

    /** the students of the class: its batch, or every active student of its program */
    public function students(OnlineClass $c): Collection
    {
        return ($c->batch_id ? Student::inBatch($c->batch_id) : Student::inProgram($c->program_id))->active()->get();
    }

    /** the classes a student may see (their active batches, or a whole-program class of their active programs) */
    public function forStudent(Student $s)
    {
        $e = $s->activeEnrollments()->get(['batch_id', 'program_id']);
        return OnlineClass::query()->where(fn ($q) => $q->whereIn('batch_id', $e->pluck('batch_id')->all() ?: [0])
            ->orWhere(fn ($w) => $w->whereNull('batch_id')->whereIn('program_id', $e->pluck('program_id')->all() ?: [0])));
    }

    private function notify(OnlineClass $c, string $type, string $title, string $body): void
    {
        $students = $this->students($c)->load('parents');
        $users = $students->map->user_id->filter()->map(fn ($id) => User::find($id))->filter()
            ->concat($students->flatMap->parents)->unique('id');
        $users->each(fn ($u) => $u->notify(new GeneralNotification($title, $body, $type, ['online_class_id' => $c->id])));
    }

    private function when(OnlineClass $c): string
    {
        return $c->scheduled_at->copy()->timezone('Asia/Dhaka')->format('Y-m-d H:i');
    }
}

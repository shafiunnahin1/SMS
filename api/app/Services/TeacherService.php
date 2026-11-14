<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{Teacher, User};
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

// A teacher = a `teacher` user (login) + a `teachers` row (job details). New teachers get an unusable random password and
// must_change_password: they set their own through "forgot password" (SMS code / email link), never a password sent by the admin.
class TeacherService
{
    private const USER_FIELDS = ['name', 'name_alt', 'phone', 'email'];   // D214 MAD.3: name_alt

    public function create(array $data): Teacher
    {
        $i = Tenancy::current();
        if (!in_array('teacher', config("institution_types.{$i->institution_type}.roles", []), true)) {
            throw new BusinessException('teacher role not available', 'role_not_available', 422);
        }
        return DB::transaction(function () use ($data, $i) {
            $user = User::create(array_intersect_key($data, array_flip(self::USER_FIELDS)) + [
                'institution_id' => $i->id, 'role' => 'teacher', 'password' => Str::random(32), 'must_change_password' => true,
            ]);
            // explicit assignment: the form sends employee_id = null when left empty, and `+` would keep that null
            $teacher = Teacher::create(array_merge(array_diff_key($data, array_flip(self::USER_FIELDS)), [
                'user_id' => $user->id, 'employee_id' => ($data['employee_id'] ?? null) ?: $this->nextEmployeeId(),
            ]));
            return $teacher->load('user');
        });
    }

    public function update(Teacher $teacher, array $data): Teacher
    {
        return app(\App\Services\Substitution\InstitutionLock::class)->run(function () use ($teacher, $data) {   // D200 SUBL.2: institution lock first
            $user = array_intersect_key($data, array_flip(self::USER_FIELDS));
            if ($user && $teacher->user) $teacher->user->fill($user)->save();      // a changed phone/email revokes tokens (UserObserver)
            $rest = array_diff_key($data, array_flip(self::USER_FIELDS));
            if (array_key_exists('employee_id', $rest) && !$rest['employee_id']) unset($rest['employee_id']);
            $teacher->fill($rest)->save();
            if (isset($rest['status']) && $teacher->user) $teacher->user->forceFill(['is_active' => $rest['status'] !== 'inactive'])->save();
            if (($rest['status'] ?? null) === 'inactive') app(\App\Services\Substitution\SlotInvalidator::class)->teacherInactive($teacher->id);
            return $teacher->fresh('user');
        });
    }

    /** Soft delete (schema: deleted_at); the login is switched off, which revokes its tokens. Assignments stay as history. */
    public function delete(Teacher $teacher): void
    {
        app(\App\Services\Substitution\InstitutionLock::class)->run(function () use ($teacher) {   // D200 SUBL.2
            app(\App\Services\Substitution\SlotInvalidator::class)->teacherInactive($teacher->id);
            $teacher->user?->forceFill(['is_active' => false])->save();
            $teacher->delete();
        });
    }

    public function nextEmployeeId(): string
    {
        $n = Teacher::withTrashed()->count() + 1;
        do { $id = 'T-' . str_pad((string) $n++, 4, '0', STR_PAD_LEFT); } while (Teacher::withTrashed()->where('employee_id', $id)->exists());
        return $id;
    }
}

<?php

namespace App\Imports;

use App\Models\{BatchTeacher, Routine, Subject, Teacher, User};
use App\Services\TeacherService;
use Illuminate\Support\Facades\Validator;

// D193 MIG.1 kind=teachers: users + teachers through TeacherService (a random password, must change it). Natural key: employee_id,
// or the phone when the file has no codes. Undo removes the teacher and the login unless they teach a batch, a subject or a
// routine slot since.
final class TeacherRowImporter extends RowImporter
{
    public function __construct(private TeacherService $teachers) {}

    public function fields(): array { return ['name', 'phone', 'employee_id', 'email', 'designation', 'department', 'joining_date']; }
    public function required(): array { return ['name', 'phone']; }
    public function aliases(): array { return ['mobile' => 'phone', 'employee' => 'employee_id', 'id' => 'employee_id', 'code' => 'employee_id']; }

    public function check(array $data): array
    {
        $v = Validator::make($data, ['name' => 'required|string|max:100', 'phone' => ['required', 'regex:/^(?:\+?88)?01[3-9]\d{8}$/'],
            'employee_id' => 'nullable|string|max:20', 'email' => 'nullable|email|max:150', 'designation' => 'nullable|string|max:50',
            'department' => 'nullable|string|max:50', 'joining_date' => 'nullable|date']);
        if ($v->fails()) return $this->result('error', $v->errors()->first(), $data);
        $phone = User::normalisePhone($data['phone']);
        if ($dup = $this->duplicate(!empty($data['employee_id']) ? 'e:' . mb_strtolower($data['employee_id']) : 'p:' . $phone, $data)) return $dup;
        $exists = !empty($data['employee_id']) ? Teacher::withTrashed()->where('employee_id', $data['employee_id'])->exists()
            : Teacher::whereHas('user', fn ($u) => $u->where('phone', $phone))->exists();
        if ($exists) return $this->result('skipped', __('errors.import_exists'), $data);
        if (User::inTenant()->where('phone', $phone)->exists()) return $this->result('error', __('errors.import_phone_taken'), $data);
        return $this->result('ok', null, $data);
    }

    public function create(array $data): array
    {
        $f = array_filter(array_intersect_key($data, array_flip($this->fields())), fn ($v) => $v !== '' && $v !== null);
        $f['phone'] = User::normalisePhone($f['phone']);
        return ['teachers', $this->teachers->create($f)->id];
    }

    public function undo(string $table, int $id): ?string
    {
        $t = Teacher::withTrashed()->find($id);
        if (!$t) return null;
        if (BatchTeacher::where('teacher_id', $t->id)->exists() || Subject::where('teacher_id', $t->id)->exists() || Routine::where('teacher_id', $t->id)->exists()) {
            return __('errors.import_has_dependents');
        }
        $userId = $t->user_id;
        $t->forceDelete();
        if ($userId) User::whereKey($userId)->delete();
        return null;
    }
}

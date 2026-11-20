<?php

namespace App\Http\Controllers\Health;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Batch, BatchTeacher, Program, Student, StudentHealthRecord, Teacher};
use Illuminate\Http\Request;

// D235 HLT.1 (extended-features.md section 6): a student's health record - a child's sensitive data. The admin and staff with
// staff.health.manage write it; the admin, staff with staff.health.read and the student's parents read it; a teacher sees only the
// blood group, conditions and emergency contact of the students of their own batches. A change is audited by who, when and which
// fields - never the values (G9: no health data in logs).
class HealthRecordController extends Controller
{
    /** GET /students/{id}/health */
    public function show(Request $request, int $id)
    {
        $s = Student::findOrFail($id);
        $r = StudentHealthRecord::where('student_id', $s->id)->first();
        if ($request->user()->role === 'teacher') {
            $t = Teacher::where('user_id', $request->user()->id)->first();
            abort_unless($t && BatchTeacher::where('teacher_id', $t->id)->whereIn('batch_id', $s->activeEnrollments()->pluck('batch_id'))->exists(), 403);
            return response()->json(['success' => true, 'data' => $this->row($s, $r, StudentHealthRecord::TEACHER_FIELDS)]);
        }
        return response()->json(['success' => true, 'data' => $this->row($s, $r, StudentHealthRecord::FIELDS)]);
    }

    /** PUT /students/{id}/health - creates the record on the first save */
    public function update(Request $request, int $id)
    {
        $s = Student::findOrFail($id);
        $f = $request->validate(['height_cm' => 'nullable|numeric|min:30|max:250', 'weight_kg' => 'nullable|numeric|min:2|max:250',
            'blood_group' => 'nullable|in:A+,A-,B+,B-,AB+,AB-,O+,O-', 'vision_left' => 'nullable|string|max:20', 'vision_right' => 'nullable|string|max:20',
            'medical_conditions' => 'nullable|string|max:2000', 'emergency_contact' => 'nullable|string|max:100', 'emergency_phone' => ['nullable', 'string', 'max:20', 'regex:/^\+?[0-9 -]{6,20}$/'],
            'doctor_name' => 'nullable|string|max:100', 'doctor_phone' => ['nullable', 'string', 'max:20', 'regex:/^\+?[0-9 -]{6,20}$/'],
            'last_checkup_date' => 'nullable|date_format:Y-m-d|before_or_equal:today', 'notes' => 'nullable|string|max:2000']);
        $r = StudentHealthRecord::firstOrNew(['student_id' => $s->id]);
        $before = $r->exists ? $r->only(array_keys($f)) : [];
        $r->fill($f)->save();
        $changed = array_values(array_filter(array_keys($f), fn ($k) => (string) ($before[$k] ?? '') !== (string) ($r->getAttribute($k) instanceof \DateTimeInterface ? $r->getAttribute($k)->format('Y-m-d') : ($r->getAttribute($k) ?? ''))));
        AuditLog::record('health.updated', $r, ['fields' => $changed]);   // field names only, never the values
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($s, $r->fresh(), StudentHealthRecord::FIELDS)]);
    }

    /** GET /health/reports - HLT.2: every class with its students and records (counts only) and its batches, to pick from */
    public function overview()
    {
        $records = StudentHealthRecord::pluck('student_id')->flip();
        $rows = Program::with('batches:id,name,program_id')->orderBy('name')->get()->map(function ($p) use ($records) {
            $ids = Student::inProgram($p->id)->active()->pluck('id');
            return ['id' => $p->id, 'name' => $p->name, 'students' => $ids->count(), 'records' => $ids->filter(fn ($i) => $records->has($i))->count(),
                'batches' => $p->batches->map(fn ($b) => ['id' => $b->id, 'name' => $b->name])->values()];
        })->values();
        return response()->json(['success' => true, 'data' => $rows]);
    }

    /** GET /health/reports/{programId}?batch_id= - blood groups, how many with conditions, how many records missing */
    public function report(Request $request, string $programId)
    {
        abort_unless(ctype_digit($programId), 404);
        $p = Program::findOrFail((int) $programId);
        $f = $request->validate(['batch_id' => 'nullable|integer']);
        if (!empty($f['batch_id'])) abort_unless(Batch::whereKey($f['batch_id'])->where('program_id', $p->id)->exists(), 404);
        $students = (!empty($f['batch_id']) ? Student::inBatch((int) $f['batch_id']) : Student::inProgram($p->id))->active()->pluck('id');
        $records = StudentHealthRecord::whereIn('student_id', $students)->get();
        $groups = $records->whereNotNull('blood_group')->countBy('blood_group')->sortKeys();
        $byStudent = $records->keyBy('student_id');
        $rows = Student::with('user:id,name')->whereIn('id', $students)->get()->sortBy(fn ($s) => $s->user?->name)->values()   // HLT.2: whom to open, never the health text
            ->map(fn ($s) => ['id' => $s->id, 'name' => $s->user?->name, 'student_id' => $s->student_id, 'has_record' => $byStudent->has($s->id), 'blood_group' => $byStudent[$s->id]->blood_group ?? null]);
        return response()->json(['success' => true, 'data' => ['program' => ['id' => $p->id, 'name' => $p->name], 'students' => $students->count(), 'records' => $records->count(), 'rows' => $rows,
            'missing' => $students->count() - $records->count(), 'blood_groups' => $groups, 'with_conditions' => $records->filter(fn ($r) => trim((string) $r->medical_conditions) !== '')->count(),
            'no_blood_group' => $students->count() - $records->whereNotNull('blood_group')->count()]]);
    }

    /** GET /health/my-students - D235 (6) HLT.2: a teacher's own batches' students with the emergency fields only */
    public function myStudents(Request $request)
    {
        $t = Teacher::where('user_id', $request->user()->id)->firstOrFail();
        $batches = BatchTeacher::where('teacher_id', $t->id)->pluck('batch_id')->unique();
        $students = Student::with(['user:id,name', 'activeEnrollments.batch:id,name'])->whereHas('activeEnrollments', fn ($q) => $q->whereIn('batch_id', $batches))->active()->get();
        $records = StudentHealthRecord::whereIn('student_id', $students->pluck('id'))->get()->keyBy('student_id');
        return response()->json(['success' => true, 'data' => $students->sortBy(fn ($s) => $s->user?->name)->values()->map(fn ($s) => $this->row($s, $records[$s->id] ?? null, StudentHealthRecord::TEACHER_FIELDS)
            + ['batch' => $s->activeEnrollments->whereIn('batch_id', $batches)->first()?->batch?->name])]);
    }

    /** GET /parent/children/{id}/health */
    public function child(Request $request, int $id)
    {
        $s = Student::whereKey($id)->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail();
        return response()->json(['success' => true, 'data' => $this->row($s, StudentHealthRecord::where('student_id', $s->id)->first(), StudentHealthRecord::FIELDS)]);
    }

    private function row(Student $s, ?StudentHealthRecord $r, array $fields): array
    {
        $s->loadMissing('user:id,name');
        $data = [];
        foreach ($fields as $k) {
            $v = $r?->getAttribute($k);
            $data[$k] = $v instanceof \DateTimeInterface ? $v->format('Y-m-d') : ($v === null ? null : (string) $v);
        }
        return ['student' => ['id' => $s->id, 'name' => $s->user?->name, 'student_id' => $s->student_id], 'exists' => (bool) $r, 'updated_at' => $r?->updated_at?->format('Y-m-d H:i'), 'record' => $data];
    }
}

# Teacher Subject Assignment Matrix

## Why Is This Needed?
- কোন শিক্ষক কোন ক্লাসে কোন বিষয় পড়ান তার সম্পূর্ণ ম্যাট্রিক্স
- Routine তৈরিতে সঠিক শিক্ষক সিলেক্ট করতে
- Mark entry-তে শুধু নিজের বিষয় দেখাতে
- Teacher workload বিশ্লেষণ

## API Endpoints
```
GET  /teachers/{id}/subjects              → শিক্ষকের সব বিষয়
POST /teachers/{id}/subjects              → বিষয় অ্যাসাইন
DELETE /teachers/{id}/subjects/{subjectId}→ বিষয় সরানো
GET  /subjects/{id}/teachers             → বিষয়ের সব শিক্ষক
GET  /programs/{id}/teacher-matrix        → ক্লাসের শিক্ষক-বিষয় ম্যাট্রিক্স
```

## TeacherSubjectService.php
```php
class TeacherSubjectService {

    public function assignSubject(int $teacherId, int $subjectId, int $programId): void {
        // Only one primary teacher per subject per class
        if (TeacherSubject::where('subject_id', $subjectId)
                          ->where('program_id', $programId)
                          ->where('is_primary', true)->exists()) {
            throw new BusinessException('এই বিষয়ে আগে থেকেই একজন শিক্ষক আছেন', 'already_assigned');
        }

        TeacherSubject::create([
            'teacher_id'    => $teacherId,
            'subject_id'    => $subjectId,
            'program_id' => $programId,
            'institution_id'     => app('currentInstitution')->id,
            'is_primary'    => true,
        ]);
    }

    public function getTeacherMatrix(int $programId): array {
        $subjects  = Subject::where('program_id', $programId)->get();
        $teachers  = Teacher::with('user')->get();
        $assigned  = TeacherSubject::where('program_id', $programId)
                                   ->get()->keyBy('subject_id');
        $matrix = [];
        foreach ($subjects as $subject) {
            $matrix[] = [
                'subject'  => $subject->name,
                'teacher'  => $assigned[$subject->id]?->teacher->user->name ?? 'অ্যাসাইন হয়নি',
                'is_set'   => isset($assigned[$subject->id]),
            ];
        }
        return $matrix;
    }
}
```

## React UI — Assignment Matrix Page
```jsx
// pages/admin/academic/SubjectAssignment.jsx
// Grid: Rows = Subjects, Columns = Classes
// Cell: Assigned Teacher name (clickable dropdown)
// Color: Green = assigned, Orange = unassigned
// Click a cell → Teacher select dropdown → save

const MatrixCell = ({ subject, programId, assigned }) => (
    <select
        defaultValue={assigned?.teacher_id ?? ''}
        onChange={e => assignTeacher(subject.id, programId, e.target.value)}
        className={assigned ? 'bg-primary-soft' : 'bg-yellow-100'}   // assigned = brand tint, unassigned = status colour
    >
        <option value="">— অ্যাসাইন করুন —</option>
        {teachers.map(t => (
            <option key={t.id} value={t.id}>{t.user.name}</option>
        ))}
    </select>
)
```

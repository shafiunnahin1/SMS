# Academic Structure — Programs, Batches, Enrollments (Revision 6)

## Overview
চার ধরনের প্রতিষ্ঠানের জন্য একটিই কাঠামো: **Program → Batch → Enrollment**। আগের `class_rooms`/`sections` টেবিল ও `ClassRoom`/`Section` model আর নেই — পুরো প্ল্যানে এগুলো `programs`/`batches` ও `Program`/`Batch` নামে আছে।

| Concept | school | college | coaching | private_batch |
|---|---|---|---|---|
| `programs` | Class 8 | একাদশ - বিজ্ঞান | HSC Physics | "General" (hidden) |
| `batches` | Section A | Section A | শনি-সোম বিকাল ৪টা | Class 9 সকালের ব্যাচ |
| `enrollments` per student | ১টি active | ১টি active | একাধিক active | একাধিক active |
| Period | `academic_years` | `academic_years` (Session) | Batch `start_date`–`end_date` | চলমান (তারিখ ছাড়া) |

Table definition: `docs/database/schema.sql` (`programs`, `batches`, `enrollments`)।

---

## The Five Rules (Non-Negotiable)

1. **Membership-এর truth হলো `enrollments`।** "এই batch-এ কারা আছে" — সবসময় `enrollments` থেকে (`status = 'active'`)।
2. **`students.program_id`, `students.batch_id`, `students.roll_no` শুধু cache** — primary active enrollment-এর কপি। এগুলো **শুধু `EnrollmentService`** লেখে; অন্য কোনো controller/service/import সরাসরি লিখবে না।
3. **প্রতিটি active student-এর ঠিক একটি `is_primary = 1` active enrollment থাকে।** school/college-এ সর্বোচ্চ একটিই active enrollment; coaching/private_batch-এ একাধিক, প্রথমটি primary।
4. **Attendance, Fee, Exam সবসময় `batch_id` বহন করে।** Student-এর batch অনুমান করা যাবে না; request-এ `batch_id` আসবে এবং enrollment যাচাই হবে।
5. **Batch থেকে student সরানো মানে enrollment `status` বদলানো** (`dropped`/`completed`/`transferred`/`promoted`) + `left_at` — row delete নয়। ইতিহাস থাকে।

পুরনো code template-এ `Student::where('batch_id', …)` বা `where('program_id', …)` দেখলে সেটি school/college-এ কাজ করবে (cache), কিন্তু **নতুন code-এ সবসময় নিচের scope ব্যবহার করুন** — তাহলে চার type-এই সঠিক:

```php
// app/Models/Student.php — add these
public function enrollments()        { return $this->hasMany(Enrollment::class); }
public function activeEnrollments()  { return $this->enrollments()->where('status', 'active'); }
public function primaryEnrollment()  { return $this->hasOne(Enrollment::class)->where('status', 'active')->where('is_primary', 1); }

public function scopeInBatch($q, int $batchId) {
    return $q->whereHas('enrollments', fn ($e) => $e->where('batch_id', $batchId)->where('status', 'active'));
}
public function scopeInProgram($q, int $programId) {
    return $q->whereHas('enrollments', fn ($e) => $e->where('program_id', $programId)->where('status', 'active'));
}
```

---

## EnrollmentService.php — Full Code
```php
<?php
namespace App\Services;

use App\Models\{Batch, Enrollment, Student};
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class EnrollmentService
{
    /** Types where a student may hold only ONE active enrollment */
    private const SINGLE = ['school', 'college'];

    public function enroll(Student $student, Batch $batch, array $data = []): Enrollment
    {
        return DB::transaction(function () use ($student, $batch, $data) {
            $type = app('currentInstitution')->institution_type;

            $active = $student->activeEnrollments()->lockForUpdate()->get();

            if ($active->contains('batch_id', $batch->id)) {
                throw ValidationException::withMessages(['batch_id' => 'এই Student ইতিমধ্যে এই batch-এ আছে']);
            }
            if (in_array($type, self::SINGLE, true) && $active->isNotEmpty()) {
                throw ValidationException::withMessages(['batch_id' => 'আগে বর্তমান ভর্তি শেষ করুন (transfer বা promotion ব্যবহার করুন)']);
            }
            $count = Enrollment::where('batch_id', $batch->id)->where('status', 'active')->count();
            if ($batch->max_capacity && $count >= $batch->max_capacity) {
                throw ValidationException::withMessages(['batch_id' => "এই batch-এ সর্বোচ্চ {$batch->max_capacity} জন ভর্তি করা যাবে"]);
            }

            $enrollment = Enrollment::create([
                'student_id'          => $student->id,
                'program_id'          => $batch->program_id,
                'batch_id'            => $batch->id,
                'academic_year_id'    => $data['academic_year_id'] ?? $batch->academic_year_id,
                'roll_no'             => $data['roll_no'] ?? ($count + 1),
                'optional_subject_id' => $data['optional_subject_id'] ?? null,
                'fee_override'        => $data['fee_override'] ?? null,
                'enrolled_at'         => $data['enrolled_at'] ?? today(),
                'is_primary'          => $active->isEmpty(),
                'status'              => 'active',
            ]);

            $this->syncCache($student);
            return $enrollment;
        });
    }

    /** $status: dropped | completed | transferred | promoted */
    public function end(Enrollment $enrollment, string $status, ?string $note = null): void
    {
        DB::transaction(function () use ($enrollment, $status, $note) {
            $enrollment->update(['status' => $status, 'left_at' => today(), 'is_primary' => 0, 'note' => $note]);

            $student = $enrollment->student;
            // promote the oldest remaining active enrollment to primary
            $next = $student->activeEnrollments()->orderBy('enrolled_at')->first();
            if ($next && !$student->primaryEnrollment()->exists()) {
                $next->update(['is_primary' => 1]);
            }
            $this->syncCache($student);
        });
    }

    /** Move within the same institution: Section A -> Section B, or batch change */
    public function transfer(Enrollment $from, Batch $to, array $data = []): Enrollment
    {
        return DB::transaction(function () use ($from, $to, $data) {
            $this->end($from, 'transferred');
            return $this->enroll($from->student, $to, $data + ['fee_override' => $from->fee_override]);
        });
    }

    /** The ONLY place that writes students.program_id / batch_id / roll_no */
    public function syncCache(Student $student): void
    {
        $primary = $student->primaryEnrollment()->first();
        $student->forceFill([
            'program_id' => $primary?->program_id,
            'batch_id'   => $primary?->batch_id,
            'roll_no'    => $primary?->roll_no,
        ])->saveQuietly();
    }
}
```
- **Student create:** `StudentService::create()` আগে `students` row বানায় (`program_id`/`batch_id` ছাড়া), তারপর request-এ `batch_id` থাকলে `EnrollmentService::enroll()` call করে। Excel import-ও একই পথে যায়।
- **Promotion (school/college):** `docs/modules/promotion-tc.md`-এর bulk promotion = প্রতি student-এ `end($old, 'promoted')` + `enroll($student, $newBatch)`।
- **TC / student inactive:** সব active enrollment `end(…, 'transferred')`, তারপর `students.status` আপডেট।

---

## Attendance (Per Batch)
- Attendance নেওয়ার unit = **batch + date**। `attendances` unique key: `(institution_id, student_id, batch_id, date)`।
- `POST /attendance` body: `{ batch_id, date, records: [{ student_id, status, note }] }`। Service যাচাই করে প্রতিটি `student_id`-এর ওই batch-এ active enrollment আছে; `program_id` batch থেকে নেওয়া হয়।
- coaching/private_batch-এ একই student একই দিনে দুই batch-এ উপস্থিত/অনুপস্থিত হতে পারে — এটি স্বাভাবিক।
- Attendance নেওয়ার দিন নির্ধারণ: school/college → holiday ছাড়া সব কর্মদিবস; coaching/private_batch → `batches.schedule`-এ থাকা দিন। Absent SMS দুই ক্ষেত্রেই একই `NotificationService` দিয়ে।

## Fee Resolution (One Function)
মাসিক tuition-এর পরিমাণ নির্ধারণের ক্রম — প্রথম যেটি non-null:

```php
// FeeService::resolveMonthlyAmount(Enrollment $e, FeeCategory $category): float
return $e->fee_override                                             // 1. negotiated per student
    ?? $e->batch->monthly_fee                                       // 2. batch-level fee
    ?? FeeStructure::where('batch_id', $e->batch_id)                // 3. fee_structures row for the batch (batch_id > 0)
           ->where('fee_category_id', $category->id)->value('amount')
    ?? FeeStructure::where('batch_id', 0)->where('program_id', $e->program_id)       // 4. program-level row (batch_id = 0)
           ->where('fee_category_id', $category->id)->value('amount')
    ?? $category->amount;                                           // 5. category default
```
- **Due তৈরি হয় enrollment প্রতি।** দুই batch-এ ভর্তি coaching student-এর মাসে দুটি due। school student-এর একটিই enrollment, তাই আচরণ আগের মতোই।
- প্রতিটি `fee_payments` row-এ `enrollment_id` ও `batch_id` সেট হয় (yearly/once ধরনের institution-wide fee হলে primary enrollment)।
- একই due দুবার নেওয়া ঠেকাতে service-level চেক: `(student_id, enrollment_id, fee_category_id, month)`।
- **মাসের মাঝখানে ভর্তি:** `institutions.settings.fee_proration` — `none` (default, পুরো মাস), `half_after_15` (১৫ তারিখের পরে ভর্তি হলে অর্ধেক)। অন্য কোনো মান নেই।
- **Course fee (coaching):** `programs.course_fee` থাকলে ভর্তির সময় `frequency = 'once'` category-তে একটি due তৈরি হয়; installment লাগলে `fee_installment` module।
- Waiver, sibling discount, late fee — `docs/modules/fees-advanced.md` অপরিবর্তিত; সেগুলো resolved amount-এর উপর প্রয়োগ হয়।

## Targeting Rule (Homework, Notice, Material, Online Class, Online Exam)
এই পাঁচটি টেবিলে `program_id` (বাধ্যতামূলক, `notices`-এ ঐচ্ছিক) এবং `batch_id` (ঐচ্ছিক) আছে। `batch_id = NULL` মানে পুরো program, মান থাকলে শুধু সেই batch। একজন Student কোন item দেখবে — একটিই function, কোথাও আলাদা করে লিখবেন না:

```php
// app/Models/Concerns/TargetsBatches.php — use in Homework, Notice, ClassMaterial, OnlineClass, OnlineExam
public function scopeVisibleToStudent($q, Student $student)
{
    $enr = $student->activeEnrollments()->get(['program_id', 'batch_id']);
    $batchIds = $enr->pluck('batch_id')->all();
    $programIds = $enr->pluck('program_id')->unique()->all();

    return $q->where(function ($w) use ($batchIds, $programIds) {
        $w->whereIn('batch_id', $batchIds)                                    // targeted at one of my batches
          ->orWhere(fn ($x) => $x->whereNull('batch_id')->whereIn('program_id', $programIds));  // whole program
        // notices only: program_id NULL AND batch_id NULL = whole institution
    });
}
```
- Parent একই scope-এ প্রতিটি সন্তানের জন্য। Teacher তৈরির সময় `batch_id` দিলে সেটি teacher-এর `batch_teachers`/`teacher_subjects`-এ থাকতে হবে (validation)।
- `notices`: `program_id` ও `batch_id` দুটোই NULL = পুরো প্রতিষ্ঠান।
- coaching ও private_batch-এ create form-এ Batch বাছাই বাধ্যতামূলক UI (Program লুকানো থাকলে শুধু Batch); school-এ Class বাছাই, Section ঐচ্ছিক।

## Exams
- `exams.program_id` বাধ্যতামূলক; `exams.batch_id` NULL = পুরো program-এর পরীক্ষা (school term exam), সেট = একটি batch-এর test।
- `exam_type`: `term` (GPA marksheet, school/college), `class_test`, `weekly`, `model_test`, `admission`।
- coaching/private_batch-এ default result view = **merit list** (মোট নম্বর অনুযায়ী rank); GPA grading ঐচ্ছিক (`settings.use_gpa`, default: school/college `true`, অন্যরা `false`)। GPA logic: `docs/modules/grading.md`।

## API Endpoints (Additions)
```
GET    /programs                          → list (with batches count)       [admin, teacher]
POST   /programs | PUT /programs/{id} | DELETE /programs/{id}               [admin]
GET    /batches?program_id=&status=       → list                            [admin, teacher]
POST   /batches | PUT /batches/{id} | DELETE /batches/{id}                  [admin]
GET    /batches/{id}/students             → active enrollments + student    [admin, teacher]
POST   /enrollments                       → { student_id, batch_id, roll_no?, fee_override?, optional_subject_id? }
PUT    /enrollments/{id}                  → roll_no, fee_override, optional_subject_id
POST   /enrollments/{id}/end              → { status: dropped|completed, note }
POST   /enrollments/{id}/transfer         → { batch_id }
GET    /students/{id}/enrollments         → full history
```
`DELETE /programs/{id}` ও `DELETE /batches/{id}` — কোনো enrollment (যেকোনো status) থাকলে `422`; archive করতে `status`/`is_active` ব্যবহার করুন।

## Notes / Edge Cases
- **private_batch-এ Program:** `settings.use_programs = false` (default) হলে UI-তে Program field নেই; নতুন Batch স্বয়ংক্রিয়ভাবে `is_default` program পায়। Admin চাইলে Settings থেকে চালু করে একাধিক বিষয় (Program) বানাতে পারে।
- **Subjects:** `subjects.program_id` আগের মতোই। coaching-এ এক course = সাধারণত এক subject; subject না থাকলে exam-এ "General" subject স্বয়ংক্রিয় তৈরি হয়।
- **Plan limit:** `max_students` = active student (যার অন্তত একটি active enrollment আছে); `max_batches` = `status in (upcoming, running)` batch।
- **Test:** `EnrollmentCacheSyncTest` — enroll/end/transfer-এর পর `students.batch_id` সবসময় primary enrollment-এর সাথে মেলে; `docs/TESTING.md` (Revision 6)।

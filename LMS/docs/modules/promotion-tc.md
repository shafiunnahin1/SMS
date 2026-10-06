# Student Promotion & Transfer Certificate (TC)

## Class Promotion (Bulk) — Revision 7
প্রমোশন = পুরনো enrollment `promoted` করে নতুন batch-এ নতুন enrollment (`EnrollmentService`)। **`students` টেবিলে সরাসরি `update(['program_id'…])` নিষিদ্ধ** (ওগুলো cache; ইতিহাস হারাত, coaching-এ একাধিক ভর্তি ভাঙত)।
```php
// Services/PromotionService.php
public function promote(array $studentIds, int $toBatchId, ?int $fromProgramId = null): array
{
    $to = Batch::with('program')->findOrFail($toBatchId);
    $svc = app(EnrollmentService::class);
    $result = ['promoted' => 0, 'skipped' => []];

    DB::transaction(function () use ($studentIds, $to, $fromProgramId, $svc, &$result) {
        foreach (Student::with('activeEnrollments')->whereIn('id', $studentIds)->get() as $student) {
            // the enrollment being left: the one in $fromProgramId (or the primary one)
            $old = $student->activeEnrollments->first(fn ($e) => $fromProgramId ? $e->program_id === $fromProgramId : $e->is_primary);
            if (!$old) { $result['skipped'][] = [$student->id, 'no active enrollment']; continue; }
            if ($old->batch_id === $to->id) { $result['skipped'][] = [$student->id, 'already in target']; continue; }

            $svc->end($old, 'promoted');
            // roll_no is assigned fresh (EnrollmentService default = next number); fee_override does not carry over automatically
            $svc->enroll($student, $to, ['academic_year_id' => $to->academic_year_id]);
            $result['promoted']++;
        }
    });
    return $result;
}

// API: POST /students/promote   Body: { student_ids[], to_batch_id, from_program_id? }
// Admin selects the students who passed and the target batch; those who failed are simply left out (they stay where they are).
// college: the UI proposes the target program with the same group_name (বিজ্ঞান -> বিজ্ঞান) - docs/modules/college.md
// Plan limit: promotion never changes the student count, so SubscriptionCheck does not run for this route.
```

## Transfer Certificate (TC)
```sql
-- tc_certificates টেবিল
CREATE TABLE tc_certificates (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    tc_number VARCHAR(30) NOT NULL,
    reason TEXT,
    last_class VARCHAR(50),
    last_attendance_date DATE,
    conduct VARCHAR(50) DEFAULT 'Good',
    issued_date DATE NOT NULL,
    issued_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

```php
// At the time of issuing TC
public function issueTC(int $studentId, array $data): array {
    $student = Student::findOrFail($studentId);
    // TC number: TC-{year}-{4-digit-auto}
    $tcNumber = 'TC-' . date('Y') . '-' . str_pad(
        TcCertificate::whereYear('created_at', date('Y'))->count() + 1, 4, '0', STR_PAD_LEFT
    );
    $tc = TcCertificate::create([
        'student_id' => $studentId,
        'tc_number'  => $tcNumber,
        'issued_date'=> now(),
        'issued_by'  => auth()->id(),
        ...$data,
    ]);
    // Student status → transferred
    $student->update(['status' => 'transferred']);
    // Generate TC PDF
    return ['tc' => $tc, 'pdf_url' => route('tc.pdf', $tc->id)];
}
```

## TC Blade Template (resources/views/pdf/tc.blade.php)
```html
<!-- অফিসিয়াল লেটারহেড ফরম্যাট -->
School Logo + নাম | TRANSFER CERTIFICATE
TC Number: {{ $tc->tc_number }} | Date: {{ $tc->issued_date }}

This is to certify that {{ $student->name }}, S/O {{ $student->father_name }},
studied in this institution from {{ $student->admission_date }} to {{ $tc->last_attendance_date }}.
Last class attended: {{ $tc->last_class }}
Conduct: {{ $tc->conduct }}

Signature: Principal
School Seal
```

## Pages
- `/admin/students/:id` → "TC ইস্যু করুন" বাটন → Modal form → PDF
- `/admin/students/promote` → ক্লাস সিলেক্ট → ছাত্র সিলেক্ট → Promote

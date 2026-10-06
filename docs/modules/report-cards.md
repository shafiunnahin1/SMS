# Student Progress Report Card

## Types of Reports
```
1. Term Report Card — প্রতি পরীক্ষার পরে
2. Annual Progress Report — বার্ষিক
3. Mid-term Progress Note — সংক্ষিপ্ত
```

## Term Report Card — DB Structure (Revision 6.5)
`report_card_summaries` এখন `docs/database/schema.sql`-এ (আগে শুধু এই ফাইলে ছিল — বাতিল করে সেখান থেকে নিন)। `results`-এ আগের `practical_marks`, `viva_marks`, `total_marks` (generated) কলাম **বাতিল**: লিখিত/ব্যবহারিক/MCQ ইত্যাদি অংশ এখন `exam_subjects.components` + `results.component_marks` (JSON) এবং `marks_obtained` সবসময় মোট (`docs/modules/grading.md` "Revision 6.3 ResultService"); সেগুলোর পাশে generated `total_marks` যোগ করলে অংশগুলো দুবার গণনা হতো। `results.teacher_remarks` (বিষয়ভিত্তিক মন্তব্য) থাকে; `class_position` শুধু `report_card_summaries`-এ (প্রতি results সারিতে র‍্যাঙ্ক রাখা অর্থহীন)।

`ReportCardService::generate(Exam)`: প্রতিটি student-এর `results` থেকে `Σ marks_obtained`, `Σ exam_subjects.full_marks` (শুধু যে বিষয়ে student-এর উপস্থিতি/নম্বর আছে এবং ঐচ্ছিক বিষয়ের নিয়ম মেনে), শতকরা হার; `settings.use_gpa` হলে `ResultService::gpa()`; র‍্যাঙ্ক শতকরা হারে (tie হলে একই র‍্যাঙ্ক); হাজিরা `attendances` থেকে পরীক্ষার সময়কালে ওই student-এর enrollment-এর batch ধরে। পুনরায় generate করলে `unique_summary` ধরে update (মন্তব্য/`is_published` অক্ষত)।

## ReportCardService.php
```php
class ReportCardService {

    public function generateSummary(int $studentId, int $examId): ReportCardSummary {
        $student = Student::with(['program','batch'])->findOrFail($studentId);
        $results = Result::where('student_id', $studentId)
                         ->where('exam_id', $examId)
                         ->with('subject')->get();

        // Sum marks of all subjects
        $totalObtained  = $results->sum('marks_obtained');
        $totalFullMarks = $results->sum('subject.full_marks');
        $percentage     = $totalFullMarks > 0
            ? round(($totalObtained / $totalFullMarks) * 100, 2) : 0;

        // GPA is 0 if any F grade exists
        $gpa = $results->contains('grade', 'F') ? 0 :
               round($results->avg('grade_point'), 2);

        // Attendance
        $exam = Exam::findOrFail($examId);
        $attendanceSummary = $this->getAttendanceSummary($studentId, $exam);

        // Position (within class)
        $classPosition = $this->calculatePosition($studentId, $examId, $student->program_id);

        return ReportCardSummary::updateOrCreate(
            ['student_id' => $studentId, 'exam_id' => $examId],
            [
                'institution_id'             => $student->institution_id,
                'total_marks_obtained'  => $totalObtained,
                'total_full_marks'      => $totalFullMarks,
                'percentage'            => $percentage,
                'gpa'                   => $gpa,
                'class_position'        => $classPosition,
                'days_present'          => $attendanceSummary['present'],
                'days_absent'           => $attendanceSummary['absent'],
                'attendance_percentage' => $attendanceSummary['percentage'],
            ]
        );
    }

    private function calculatePosition(int $studentId, int $examId, int $programId): int {
        // Sort by all students' GPA descending
        $rankings = ReportCardSummary::whereHas('student', fn($q) =>
                        $q->where('program_id', $programId))
                    ->where('exam_id', $examId)
                    ->orderByDesc('gpa')
                    ->orderByDesc('percentage')
                    ->pluck('student_id');

        return $rankings->search($studentId) + 1;
    }
}
```

## Report Card PDF Layout (Blade Template)
```
resources/views/pdf/report-card.blade.php

┌─────────────────────────────────────────────────────────┐
│ [LOGO]  INSTITUTION NAME                                     │
│         Address | Phone | Email                         │
│         TERM REPORT CARD — [Exam Name] [Year]           │
├────────────────────┬────────────────────────────────────┤
│ Student: [Name]    │ Class: [X] Batch: [A]            │
│ ID: [STD-2025-001] │ Roll: [05]                         │
│ Academic Year: 2025│ Date of Issue: [date]              │
├───────────┬────────┬────────┬────────┬──────────────────┤
│ Subject   │ Full   │ Marks  │ Grade  │ Grade Point      │
├───────────┼────────┼────────┼────────┼──────────────────┤
│ Bengali   │ 100    │ 82     │ A      │ 4.00             │
│ English   │ 100    │ 75     │ A      │ 4.00             │
│ Math      │ 100    │ 91     │ A+     │ 5.00             │
│ ...       │        │        │        │                  │
├───────────┴────────┼────────┴────────┴──────────────────┤
│ Total Marks: 500   │ Obtained: 396  Percentage: 79.2%   │
│ GPA: 4.10          │ Class Position: 3rd               │
├────────────────────┴───────────────────────────────────┤
│ Attendance: Present 85 days | Absent 5 days | 94.4%    │
├─────────────────────────────────────────────────────────┤
│ Class Teacher's Remarks: [text]                         │
│ Principal's Remarks: [text]                             │
├────────────────┬────────────────┬───────────────────────┤
│ Class Teacher  │   Principal    │ Parent's Signature    │
│ Signature      │   Signature    │                       │
└────────────────┴────────────────┴───────────────────────┘
```

## API Endpoints
```
POST /report-cards/generate/{examId}     → সব ছাত্রের summary generate
GET  /report-cards/{studentId}/{examId}  → নির্দিষ্ট ছাত্রের report card
GET  /report-cards/{studentId}/{examId}/pdf → PDF download
PATCH /report-cards/{id}/publish         → পাবলিশ (parent দেখতে পাবে)
PUT  /report-cards/{id}/remarks          → Teacher/Principal remarks যোগ
GET  /report-cards/batch/{batchId}/{examId} → পুরো batch-এর summary
```

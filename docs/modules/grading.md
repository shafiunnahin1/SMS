# Grading System (Bangladesh SSC/HSC Standard)

> **Revision 6.3 — এই ফাইলের নিচের কোড বদলেছে (পুরনো কোড বাতিল):**
> 1. **নম্বর ১০০ ধরা যাবে না।** প্রতিটি পরীক্ষার প্রতিটি বিষয়ের পূর্ণমান/পাসমান `exam_subjects`-এ (`schema.sql`); গ্রেড হয় **শতকরা হার** (`marks_obtained / full_marks × 100`) থেকে। না হলে ২৫ নম্বরের সাপ্তাহিক টেস্ট ও ৭০+৩০ নম্বরের বোর্ড-ধাঁচের বিষয় চলে না।
> 2. **গ্রেড-হিসাব শুধু backend-এ।** নিচের `gradeCalculator.js` (React) বাতিল — frontend কখনো গ্রেড হিসাব করে না, save-এর response থেকে দেখায় (দুই জায়গায় logic = ভুল হওয়ার নিশ্চিত পথ)।
> 3. **GPA/গ্রেড ঐচ্ছিক:** `institutions.settings.use_gpa` (school/college default `true`, coaching/private_batch default `false` → শুধু শতকরা হার ও merit rank)।
> 4. **গ্রেড-স্কেল কনফিগারযোগ্য:** default নিচের SSC/HSC টেবিল (`config/grading.php`); প্রতিষ্ঠান `settings.grading_scale` দিয়ে নিজেরটি দিতে পারে (যেমন মাদ্রাসা/ইংরেজি মাধ্যম)।
> 5. **Component নম্বর** (লিখিত/MCQ/ব্যবহারিক): `exam_subjects.components` সেট থাকলে নম্বর `results.component_marks`-এ; `marks_obtained` = যোগফল; একটিও component-এর পাসমান না পেলে `is_pass = 0` (মোট যতই হোক)।

### Revision 6.3 ResultService (Authoritative)
```php
// config/grading.php
return ['default_scale' => [   // min percentage => [grade, point], checked top-down
    ['min' => 80, 'grade' => 'A+', 'point' => 5.00], ['min' => 70, 'grade' => 'A',  'point' => 4.00],
    ['min' => 60, 'grade' => 'A-', 'point' => 3.50], ['min' => 50, 'grade' => 'B',  'point' => 3.00],
    ['min' => 40, 'grade' => 'C',  'point' => 2.00], ['min' => 33, 'grade' => 'D',  'point' => 1.00],
    ['min' => 0,  'grade' => 'F',  'point' => 0.00],
]];

// app/Services/ResultService.php
public function score(ExamSubject $es, ?float $total, ?array $components, bool $absent): array
{
    if ($absent || $total === null && !$components) return ['marks_obtained' => null, 'component_marks' => null, 'percentage' => null,
                                                            'grade' => 'F', 'grade_point' => 0.00, 'is_absent' => $absent, 'is_pass' => 0];
    $defs = collect($es->components ?? []);
    $passComponents = true;
    if ($defs->isNotEmpty()) {
        foreach ($defs as $d) {
            $m = (float) ($components[$d['key']] ?? 0);
            abort_if($m < 0 || $m > $d['full'], 422, "{$d['label']}: সর্বোচ্চ {$d['full']}");
            if ($m < $d['pass']) $passComponents = false;
        }
        $total = collect($components)->only($defs->pluck('key'))->sum();
    }
    abort_if($total < 0 || $total > $es->full_marks, 422, "সর্বোচ্চ নম্বর {$es->full_marks}");

    $pct   = round($total / $es->full_marks * 100, 2);
    $pass  = $total >= $es->pass_marks && $passComponents;
    $scale = app('currentInstitution')->settings['grading_scale'] ?? config('grading.default_scale');
    $row   = collect($scale)->first(fn ($r) => $pct >= $r['min']);
    // a fail is always F / 0.00 regardless of the percentage band
    return ['marks_obtained' => $total, 'component_marks' => $defs->isNotEmpty() ? $components : null, 'percentage' => $pct,
            'grade' => $pass ? $row['grade'] : 'F', 'grade_point' => $pass ? $row['point'] : 0.00, 'is_absent' => 0, 'is_pass' => (int) $pass];
}

public function bulkSaveMarks(Exam $exam, int $subjectId, array $rows): void
{
    $es = ExamSubject::where('exam_id', $exam->id)->where('subject_id', $subjectId)->firstOrFail();
    DB::transaction(function () use ($exam, $es, $rows) {
        foreach ($rows as $r) {
            Result::updateOrCreate(
                ['exam_id' => $exam->id, 'student_id' => $r['student_id'], 'subject_id' => $es->subject_id],   // unique_result
                $this->score($es, $r['marks_obtained'] ?? null, $r['components'] ?? null, (bool) ($r['is_absent'] ?? false))
                    + ['institution_id' => app('currentInstitution')->id]);
        }
    });
}

/** Only when settings.use_gpa. GPA = 0 if any subject failed; optional (4th) subject rule: docs/modules/college.md */
public function gpa(Collection $results): float
{
    if ($results->contains('is_pass', 0)) return 0.00;
    return round($results->avg('grade_point'), 2);
}
```
- মার্ক এন্ট্রির লোডে ওই exam-এর `exam_subjects` পূর্ণমান ও component সংজ্ঞা পাঠান; frontend শুধু সীমা (`max`) বসায় ও input যাচাই করে — গ্রেড দেখায় save-এর পর।
- Student যাদের বিষয় ঐচ্ছিক (`enrollments.optional_subject_id`), শুধু তারাই ওই বিষয়ের mark-entry list-এ আসে।
- Merit list/র‍্যাঙ্ক: মোট শতকরা হার (সব `exam_subjects.full_marks`-এর যোগফল ধরে), tie হলে একই rank।
- `exam_subjects` তৈরি: Exam তৈরির সময় program-এর সব subject থেকে স্বয়ংক্রিয় (`full_marks/pass_marks` = subject-এর মান), Admin তারিখ-সময়, পূর্ণমান, component সম্পাদনা করে।

> পুরনো Revision 5 কোড (১০০-ভিত্তিক `calculateGrade`, React `gradeCalculator.js`) **মুছে ফেলা হয়েছে** — ইতিহাস `git`-এ। গ্রেড-হিসাব শুধু উপরের `ResultService::score()`।

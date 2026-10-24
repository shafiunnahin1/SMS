<?php

namespace Tests\Feature\Exams;

use App\Models\{Batch, Institution, Program, QbCreativePart, QbQuestion, QbQuestionOption, QbQuestionType, QbSubject, QbUnlock, Subject, Teacher, User};
use App\Services\StudentService;
use App\Support\Tenancy;
use Illuminate\Support\Facades\Queue;

// A school with Class 10 (two sections), two subjects - Bangla (Karim is its subject teacher) and Physics (70 written + 30 MCQ
// is set per exam) - and three students; Mine and Sister share a guardian phone, so one parent has two children.
trait ExamFixture
{
    protected function school(string $slug): array
    {
        Queue::fake();
        $i = $this->makeInstitution($slug, 'school');
        $d = Tenancy::as($i, function () use ($i) {
            $p = Program::create(['name' => 'Class 10']);
            $a = Batch::create(['program_id' => $p->id, 'name' => 'A']);
            $b = Batch::create(['program_id' => $p->id, 'name' => 'B']);
            $karimUser = $this->makeUser($i, 'teacher');
            $otherUser = User::create(['institution_id' => $i->id, 'name' => 'Other teacher', 'email' => 'other-teacher@example.test', 'password' => 'Secret@1234', 'role' => 'teacher', 'is_active' => true]);
            $karim = Teacher::create(['user_id' => $karimUser->id, 'employee_id' => 'T-K']);
            Teacher::create(['user_id' => $otherUser->id, 'employee_id' => 'T-O']);
            $bangla = Subject::create(['program_id' => $p->id, 'name' => 'বাংলা', 'teacher_id' => $karim->id, 'full_marks' => 100, 'pass_marks' => 33]);
            $physics = Subject::create(['program_id' => $p->id, 'name' => 'পদার্থবিজ্ঞান', 'full_marks' => 100, 'pass_marks' => 33]);
            $svc = app(StudentService::class);
            $mine = $svc->create(['name' => 'Mine', 'guardian_phone' => '01711000001'], $a, ['roll_no' => 1]);
            $sister = $svc->create(['name' => 'Sister', 'guardian_phone' => '01711000001'], $b, ['roll_no' => 1]);
            $other = $svc->create(['name' => 'Other', 'guardian_phone' => '01711000002'], $a, ['roll_no' => 2]);
            return compact('p', 'a', 'b', 'karimUser', 'otherUser', 'bangla', 'physics', 'mine', 'sister', 'other');
        });
        $d['parent'] = User::where('institution_id', $i->id)->where('phone', '01711000001')->first();
        $d['parent']->forceFill(['must_change_password' => false])->save();
        $d['admin'] = $this->makeUser($i, 'admin');
        return ['i' => $i, 'host' => $this->hostOf($i)] + $d;
    }

    /** An exam of Class 10 with Physics split 70 + 30 */
    protected function exam(array $s, string $name = 'Half yearly'): int
    {
        $id = $this->api('POST', $s['host'], 'exams', $s['admin'], ['name' => $name, 'program_id' => $s['p']->id, 'exam_type' => 'term', 'academic_year' => 2026])
            ->assertCreated()->json('data.id');
        $this->api('PUT', $s['host'], "exams/{$id}/subjects", $s['admin'], ['subjects' => [
            ['subject_id' => $s['bangla']->id, 'full_marks' => 100, 'pass_marks' => 33],
            ['subject_id' => $s['physics']->id, 'full_marks' => 100, 'pass_marks' => 33, 'components' => [
                ['key' => 'written', 'label' => 'লিখিত', 'full' => 70, 'pass' => 23], ['key' => 'mcq', 'label' => 'MCQ', 'full' => 30, 'pass' => 10]]],
        ]])->assertOk();
        return $id;
    }

    /** D158: a paper of 30 MCQ + 50 creative + 20 short marks, bought free and (by default) finalized */
    protected function paper(array $s, string $status = 'final'): int
    {
        $super = User::firstOrCreate(['phone' => '01700000099'], ['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $mcqType = QbQuestionType::firstOrCreate(['slug' => 'mcq'], ['name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq'])->id;
        $creType = QbQuestionType::firstOrCreate(['slug' => 'creative'], ['name_bn' => 'সৃজনশীল', 'name_en' => 'Creative', 'family' => 'creative'])->id;
        $shortType = QbQuestionType::firstOrCreate(['slug' => 'short'], ['name_bn' => 'সংক্ষিপ্ত', 'name_en' => 'Short', 'family' => 'short'])->id;
        $subject = QbSubject::firstOrCreate(['name_bn' => 'পদার্থবিজ্ঞান'], ['name_en' => 'Physics'])->id;
        $q = fn ($type) => QbQuestion::create(['qb_question_type_id' => $type, 'qb_subject_id' => $subject, 'question_text' => 'q' . uniqid(), 'status' => 'published', 'created_by' => $super->id]);
        $mcq = $q($mcqType);
        foreach ([true, false, false, false] as $n => $ok) QbQuestionOption::create(['qb_question_id' => $mcq->id, 'label' => 'x', 'content_text' => "o{$n}", 'is_correct' => $ok]);
        $cq = $q($creType);
        QbCreativePart::create(['qb_question_id' => $cq->id, 'part_label' => 'ক', 'cognitive_level' => 'knowledge', 'marks' => 1, 'question_text' => 'x']);
        $short = $q($shortType);
        Tenancy::as($s['i'], function () use ($s, $mcq, $cq, $short) {
            foreach ([$mcq, $cq, $short] as $x) QbUnlock::create(['item_type' => 'question', 'item_id' => $x->id, 'unlocked_by' => $s['admin']->id, 'price' => '0.00', 'reason' => 'free']);
        });
        $id = $this->api('POST', $s['host'], 'question-bank/papers', $s['admin'], ['title' => 'Physics paper', 'sets_count' => 1, 'sections' => [
            ['title' => 'MCQ', 'items' => [['qb_question_id' => $mcq->id, 'marks' => '30']]],
            ['title' => 'CQ', 'items' => [['qb_question_id' => $cq->id, 'marks' => '50']]],
            ['title' => 'Short', 'items' => [['qb_question_id' => $short->id, 'marks' => '20']]],
        ]])->assertCreated()->json('data.id');
        if ($status === 'final') $this->api('POST', $s['host'], "question-bank/papers/{$id}/finalize", $s['admin'], ['strategy' => 'serial'])->assertOk();
        return $id;
    }
}

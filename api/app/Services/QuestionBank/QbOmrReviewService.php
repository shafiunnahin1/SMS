<?php

namespace App\Services\QuestionBank;

use App\Exceptions\BusinessException;
use App\Models\{Enrollment, QbOmrForm, QbOmrScan, QbPaper, QbPaperItem, QbPaperVariant, User};
use App\Support\Money;
use Illuminate\Support\Facades\DB;

// D127 (4)/(5), R2.1.6: the review and grading of OMR sheets. Every sheet stays "needs_review" until a person approves it, and
// approval is refused while anything is uncertain: an unreadable roll, an unknown or missing set code (the reviewer may use the
// main set or cancel the sheet), a blank or multiple mark not confirmed, a roll that matches no student or several, a roll
// already on another sheet of the form without an "update" / "keep both" choice. Grading (qbank's: correct x marks - wrong x
// negative) uses the frozen set's own key (D126 (2)), so a later question edit never changes a grade. Marks never reach exam
// results here (that is R2.1.7).
class QbOmrReviewService
{
    private const LABELS = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ'];
    public const OPEN = ['needs_review'];

    public function __construct(private QbOmrFormService $forms) {}

    /** the uncertainties left on a sheet (empty = it may be approved) */
    public function reasons(QbOmrForm $form, QbPaper $paper, QbOmrScan $scan): array
    {
        $c = $scan->comparison_json ?? [];
        $reasons = [];
        if (($c['matched_by'] ?? null) === 'id') {                // D159 (4): matched by the student's ID - the roll is not needed to find them
            if (!empty($c['omr_id_uncertain'])) $reasons[] = 'student_id_unconfirmed';
        } elseif (!preg_match('/^\d+$/', (string) $scan->roll)) $reasons[] = 'roll_unreadable';
        elseif (!empty($c['roll_uncertain'])) $reasons[] = 'roll_unconfirmed';   // D131: read, but a person confirms it
        $codes = QbPaperVariant::where('qb_paper_id', $paper->id)->pluck('code')->map(fn ($v) => (string) $v)->all();
        if (($c['set_resolution'] ?? null) !== 'main') {
            if (!filled($scan->set_code)) $reasons[] = 'set_code_missing';
            elseif (!in_array($scan->set_code, $codes, true)) $reasons[] = 'set_code_unknown';
            elseif (!empty($c['set_uncertain'])) $reasons[] = 'set_code_unconfirmed';
        }
        foreach ($scan->answers_json ?? [] as $a) {
            if (($a['status'] ?? null) !== 'marked' && empty($a['confirmed'])) { $reasons[] = 'answers_need_review'; break; }
        }
        if (!$scan->matched_student_id) $reasons[] = ($c['student_candidates'] ?? 0) > 1 ? 'student_ambiguous' : 'student_unmatched';
        if ($this->duplicates($form, $scan)->isNotEmpty() && !in_array($c['duplicate_decision'] ?? null, ['update', 'keep_both'], true)) $reasons[] = 'duplicate_roll';
        return $reasons;
    }

    /** D159 (4): first the student ID read from the sheet (exactly one student of this tenant has it), then the roll in the paper's
     *  program enrollment (active); 0 or several matches stay for a person to choose - never a silent guess */
    public function match(QbPaper $paper, QbOmrScan $scan): void
    {
        $c = $scan->comparison_json ?? [];
        unset($c['matched_by']);
        if (preg_match('/^\d{10}$/', (string) ($c['omr_id'] ?? ''))) {
            $byId = app(\App\Services\StudentOmrId::class)->find($c['omr_id']);
            if (count($byId) === 1) { $c['student_candidates'] = 1; $c['matched_by'] = 'id'; $scan->comparison_json = $c; $scan->matched_student_id = $byId[0]; return; }
            $c['omr_id_candidates'] = count($byId);              // none or several: fall back to the roll and show it in review
        }
        if (!$paper->program_id || !preg_match('/^\d+$/', (string) $scan->roll)) { $c['student_candidates'] = 0; $scan->comparison_json = $c; return; }
        $ids = Enrollment::where('program_id', $paper->program_id)->where('status', 'active')->where('roll_no', (int) $scan->roll)->pluck('student_id')->unique()->values();
        $c['student_candidates'] = $ids->count();
        $scan->comparison_json = $c;
        $scan->matched_student_id = $ids->count() === 1 ? (int) $ids[0] : null;
    }

    /** a reviewer's corrections: roll, set code or "use the main set", the student, answers (selected / confirmed), the duplicate choice */
    public function update(User $actor, int $scanId, array $in): QbOmrScan
    {
        return DB::transaction(function () use ($actor, $scanId, $in) {
            [$paper, $form, $scan] = $this->find($actor, $scanId, true);
            if (!in_array($scan->status, self::OPEN, true)) throw new BusinessException(__('errors.qb_omr_scan_closed'), 'qb_omr_scan_closed', 422);
            $c = $scan->comparison_json ?? [];
            if (array_key_exists('roll', $in)) {                // a person's roll is confirmed, even when it is the one read (D131)
                $sameRoll = (string) $in['roll'] === (string) $scan->roll;
                $scan->roll = $in['roll'];
                if (!$sameRoll || !$scan->matched_student_id) { $scan->matched_student_id = null; $this->match($paper, $scan); $c = $scan->comparison_json; }
                unset($c['roll_uncertain']);
            }
            if (array_key_exists('set_code', $in)) { $scan->set_code = $in['set_code']; unset($c['set_resolution'], $c['set_uncertain']); }
            if (($in['set_resolution'] ?? null) === 'main') { $c['set_resolution'] = 'main'; unset($c['set_uncertain']); }
            if (array_key_exists('student_id', $in)) {
                $ok = $in['student_id'] === null || ($paper->program_id
                    ? Enrollment::where('program_id', $paper->program_id)->where('student_id', $in['student_id'])->where('status', 'active')->exists()
                    : \App\Models\Student::whereKey($in['student_id'])->exists());
                if (!$ok) throw new BusinessException(__('errors.qb_omr_student_outside'), 'qb_omr_student_outside', 422);
                $scan->matched_student_id = $in['student_id'];
                unset($c['omr_id_uncertain']);                       // D159 (4): a person chose the student - the ID read is settled
            }
            if (isset($in['answers'])) {
                $answers = $scan->answers_json ?? [];
                foreach ($in['answers'] as $no => $a) {
                    $i = (int) $no - 1;
                    if (!isset($answers[$i])) continue;
                    $sel = array_values(array_unique(array_map('intval', $a['selected'] ?? $answers[$i]['selected'])));
                    sort($sel);
                    $answers[$i] = ['status' => count($sel) === 0 ? 'blank' : (count($sel) === 1 ? 'marked' : 'ambiguous'), 'selected' => $sel,
                        'confirmed' => (bool) ($a['confirmed'] ?? false), 'corrected' => true];
                }
                $scan->answers_json = $answers;
                $scan->answered_count = count(array_filter($answers, fn ($a) => $a['status'] === 'marked'));
            }
            if (isset($in['duplicate_decision'])) $c['duplicate_decision'] = $in['duplicate_decision'];
            $scan->comparison_json = $c;
            $scan->comparison_json = ['reason_codes' => $this->reasons($form, $paper, $scan), 'requires_manual_review' => true] + $c;
            $scan->save();
            return $scan->fresh();
        });
    }

    /** approve: refused while anything is uncertain; grades against the frozen set key; "update" closes the older sheet of that roll */
    public function approve(User $actor, int $scanId): QbOmrScan
    {
        return DB::transaction(function () use ($actor, $scanId) {
            [$paper, $form, $scan] = $this->find($actor, $scanId, true);
            if (!in_array($scan->status, self::OPEN, true)) throw new BusinessException(__('errors.qb_omr_scan_closed'), 'qb_omr_scan_closed', 422);
            $reasons = $this->reasons($form, $paper, $scan);
            if ($reasons) throw new BusinessException(__('errors.qb_omr_unresolved', ['reasons' => implode(', ', $reasons)]), 'qb_omr_unresolved', 422, ['reasons' => implode(', ', $reasons)]);
            $grade = $this->grade($form, $paper, $scan);
            if (($scan->comparison_json['duplicate_decision'] ?? null) === 'update') {
                $this->duplicates($form, $scan)->each(fn ($old) => $old->update(['status' => 'superseded']));
            }
            $scan->update(['status' => 'graded', 'correct_count' => $grade['correct'], 'obtained_marks' => $grade['marks'], 'reviewed_by' => $actor->id,
                'comparison_json' => ['reason_codes' => [], 'requires_manual_review' => false, 'graded_set' => $grade['set'], 'per_question' => $grade['per_question']] + ($scan->comparison_json ?? [])]);
            return $scan->fresh();
        });
    }

    /** cancel a sheet (an unusable scan or an invalid set): kept, counts 0, never graded */
    public function cancel(User $actor, int $scanId): QbOmrScan
    {
        [, , $scan] = $this->find($actor, $scanId);
        if (!in_array($scan->status, self::OPEN, true)) throw new BusinessException(__('errors.qb_omr_scan_closed'), 'qb_omr_scan_closed', 422);
        $scan->update(['status' => 'cancelled', 'obtained_marks' => '0.00', 'correct_count' => 0, 'reviewed_by' => $actor->id]);
        return $scan->fresh();
    }

    /** qbank's grading against the frozen set's key; OMR row n = the n-th MCQ in that set's printed order */
    /** D159 (5): with $qbSubjectId only that subject block's rows count (a multi-subject sheet graded per subject; the frozen set
     *  says which subject each row belongs to - sets shuffle only inside a block) */
    public function grade(QbOmrForm $form, QbPaper $paper, QbOmrScan $scan, ?int $qbSubjectId = null): array
    {
        $variants = QbPaperVariant::where('qb_paper_id', $paper->id)->orderBy('variant_number')->get();
        $variant = ($scan->comparison_json['set_resolution'] ?? null) === 'main' ? $variants->first() : $variants->firstWhere('code', $scan->set_code);
        if (!$variant) throw new BusinessException(__('errors.qb_no_such_set'), 'qb_no_such_set', 422);
        $mcq = QbPaperItem::whereHas('section', fn ($q) => $q->where('qb_paper_id', $paper->id))->whereHas('question.type', fn ($q) => $q->where('slug', 'mcq'))
            ->pluck('qb_question_id')->map(fn ($v) => (int) $v)->flip();
        $key = [];
        $rowSubject = [];
        // an ungrouped paper's frozen layout carries no subject: the question's own subject decides the row's block
        $subjectOf = $qbSubjectId === null ? collect() : \App\Models\QbQuestion::whereIn('id', $mcq->keys())->pluck('qb_subject_id', 'id');
        foreach ($variant->layout_json as $s) foreach ($s['items'] as $it) {
            if (!$mcq->has((int) $it['qb_question_id'])) continue;
            $rowSubject[] = isset($it['qb_subject_id']) ? (int) $it['qb_subject_id'] : (isset($subjectOf[(int) $it['qb_question_id']]) ? (int) $subjectOf[(int) $it['qb_question_id']] : null);
            $key[] = array_values(array_filter(array_map(fn ($l) => array_search($l, self::LABELS, true), $it['correct'] ?? []), fn ($v) => $v !== false));
        }
        $m = $form->settings_json['marking'] ?? [];
        $policy = $m['multiple_answer_policy'] ?? 'wrong';
        $correct = 0;
        $wrong = 0;
        $per = [];
        foreach ($scan->answers_json ?? [] as $i => $a) {
            if ($qbSubjectId !== null && ($rowSubject[$i] ?? null) !== $qbSubjectId) continue;
            $sel = $a['selected'] ?? [];
            $right = $key[$i] ?? [];
            if ($sel === []) { $per[] = 'blank'; continue; }
            sort($sel);
            sort($right);
            $ok = $policy === 'correct_if_any' ? count(array_intersect($sel, $right)) > 0 : $sel === $right;
            $per[] = $ok ? 'correct' : 'wrong';
            $ok ? $correct++ : $wrong++;
        }
        $paisa = $correct * Money::toPaisa((string) ($m['question_mark'] ?? '1'));
        if (!empty($m['negative_mark_enabled'])) $paisa -= $wrong * Money::toPaisa((string) ($m['negative_mark'] ?? '0'));
        return ['correct' => $correct, 'marks' => Money::format($paisa), 'set' => $variant->code, 'per_question' => $per];
    }

    /** the results CSV of a form: one row per sheet (graded with marks; others with their status) */
    public function csv(User $actor, int $paperId): string
    {
        $paper = $this->forms->paper($actor, $paperId);
        $form = $this->forms->form($paper);
        $out = fopen('php://temp', 'r+');
        fputcsv($out, ['sheet', 'roll', 'student_id', 'student', 'set', 'status', 'answered', 'correct', 'marks']);
        QbOmrScan::with('matchedStudent.user:id,name')->where('qb_omr_form_id', $form->id)->orderBy('roll')->orderBy('id')
            ->chunkById(500, function ($rows) use ($out) {
                foreach ($rows as $r) fputcsv($out, [$r->id, $r->roll, $r->matched_student_id, $r->matchedStudent?->user?->name,
                    $r->comparison_json['graded_set'] ?? $r->set_code, $r->status, $r->answered_count, $r->correct_count, $r->obtained_marks]);
            });
        rewind($out);
        return "\xEF\xBB\xBF" . stream_get_contents($out);
    }

    /** a sheet of this tenant whose paper the person may use (admin: any, teacher: own); anything else is 404 */
    public function find(User $actor, int $scanId, bool $lock = false): array
    {
        $scan = QbOmrScan::query()->when($lock, fn ($q) => $q->lockForUpdate())->findOrFail($scanId);
        $form = QbOmrForm::findOrFail($scan->qb_omr_form_id);
        $paper = $this->forms->paper($actor, (int) $form->qb_paper_id);
        return [$paper, $form, $scan];
    }

    private function duplicates(QbOmrForm $form, QbOmrScan $scan)
    {
        if (!filled($scan->roll)) return collect();
        return QbOmrScan::where('qb_omr_form_id', $form->id)->where('roll', $scan->roll)->whereKeyNot($scan->id)->whereIn('status', ['needs_review', 'graded'])->get();
    }
}

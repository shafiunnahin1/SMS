<?php

namespace App\Services\Exams;

use App\Exceptions\BusinessException;
use App\Jobs\SendExamResultSmsJob;
use App\Models\{AuditLog, Consent, Exam, ExamResultSms, Result, SmsLog, Student, User};
use App\Services\{ConsentService, ExamService, InstitutionSettings, SmsService};
use App\Support\Tenancy;

/**
 * D161 (2)(3): an exam's result SMS to every sitting student's guardian, and a correction SMS when the admin changes a published mark.
 * A message goes only with the guardian's SMS opt-in on record (else `skipped`); it is `pending` while the wallet cannot pay - the run
 * stops there and never drives the balance below zero; "Send SMS" again sends only the pending and failed ones, never a sent one.
 */
class ResultSmsService
{
    public function __construct(private ExamService $exams, private SmsService $sms, private ConsentService $consents) {}

    /** the admin's "Send SMS": queue a result message for each sitting student with marks (once), then send what is not yet sent */
    public function run(Exam $exam, User $actor): array
    {
        if ($exam->status !== 'published') throw new BusinessException('publish the result first', 'exam_not_published', 422);
        $merit = $this->exams->meritList($exam);
        $have = ExamResultSms::where('exam_id', $exam->id)->where('kind', 'result')->pluck('student_id')->flip();
        $students = Student::whereIn('id', array_column($merit['rows'], 'student_id'))->with('user:id,name')->get()->keyBy('id');
        foreach ($merit['rows'] as $row) {
            if ($row['total'] === null || isset($have[$row['student_id']]) || !($s = $students->get($row['student_id']))) continue;
            ExamResultSms::create(['exam_id' => $exam->id, 'student_id' => $s->id, 'kind' => 'result', 'phone' => $s->guardian_phone,
                'message' => $this->resultText($exam, $s, $row, $merit['full_marks']), 'created_by' => $actor->id]);
        }
        AuditLog::record('exam.result_sms_run', $exam, ['queued' => ExamResultSms::where('exam_id', $exam->id)->whereIn('status', ['pending', 'failed'])->count()]);
        SendExamResultSmsJob::dispatch($exam->id, $actor->id, (int) Tenancy::current()->id);
        return $this->report($exam);
    }

    /** D161 (3): the admin corrected a published mark - one correction message with the old and new result, sent at once */
    public function correction(Exam $exam, Result $result, array $before, User $actor): void
    {
        $s = Student::with('user:id,name')->find($result->student_id);
        if (!$s) return;
        $row = collect($this->exams->meritList($exam)['rows'])->firstWhere('student_id', $s->id);
        $subject = $result->subject?->name ?? '';
        $fmt = fn ($m, $g) => $m === null ? '—' : rtrim(rtrim(number_format((float) $m, 2, '.', ''), '0'), '.') . ($g ? " ({$g})" : '');
        $locale = $this->sms->localeFor($s->primaryParent(), Tenancy::current());
        $text = __('sms.result_corrected', ['exam' => $exam->name, 'name' => $s->user?->name, 'subject' => $subject,
            'before' => $fmt($before['marks_obtained'], $before['grade']), 'after' => $fmt($result->marks_obtained, $result->grade),
            'total' => $fmt($row['total'] ?? null, null), 'rank' => $row['rank'] ?? '—'], $locale);
        ExamResultSms::create(['exam_id' => $exam->id, 'student_id' => $s->id, 'kind' => 'correction', 'phone' => $s->guardian_phone, 'message' => $text, 'created_by' => $actor->id]);
        AuditLog::record('exam.result_corrected', $exam, ['student_id' => $s->id, 'subject_id' => $result->subject_id]);
        SendExamResultSmsJob::dispatch($exam->id, $actor->id, (int) Tenancy::current()->id);
    }

    /** the job: every pending / failed message of the exam in order; an empty wallet leaves the rest pending */
    public function sendQueued(Exam $exam, ?int $actorId): void
    {
        $walletEmpty = false;                                                       // after that, the rest stay pending (no send tried)
        foreach (ExamResultSms::where('exam_id', $exam->id)->whereIn('status', ['pending', 'failed'])->orderBy('id')->get() as $m) {
            if (!$m->phone || !$this->optedIn($m->student_id, $m->phone)) { $m->update(['status' => 'skipped', 'error' => $m->phone ? 'no_consent' : 'no_phone']); continue; }
            if ($walletEmpty) { $m->update(['status' => 'pending']); continue; }
            $m->increment('attempts');
            try {
                $ok = $this->sms->send($m->phone, $m->message, $actorId);
            } catch (BusinessException $e) {
                if (in_array($e->errorCode, ['sms_quota_exceeded', 'sms_disabled'], true)) { $m->update(['status' => 'pending', 'error' => $e->errorCode]); $walletEmpty = true; continue; }   // wait for a recharge
                throw $e;
            }
            $logId = SmsLog::where('to_phone', $m->phone)->latest('id')->value('id');
            $m->update(['status' => $ok ? 'sent' : 'failed', 'sms_log_id' => $logId, 'error' => $ok ? null : 'gateway_error']);
        }
    }

    /** sent / total with the other counts, per kind */
    public function report(Exam $exam): array
    {
        $out = [];
        foreach (['result', 'correction'] as $kind) {
            $c = ExamResultSms::where('exam_id', $exam->id)->where('kind', $kind)->selectRaw('status, COUNT(*) AS n')->groupBy('status')->pluck('n', 'status');
            $out[$kind] = ['total' => (int) $c->sum(), 'sent' => (int) ($c['sent'] ?? 0), 'pending' => (int) ($c['pending'] ?? 0),
                'failed' => (int) ($c['failed'] ?? 0), 'skipped' => (int) ($c['skipped'] ?? 0)];
        }
        return $out;
    }

    /** D161 (2): result SMS needs the guardian's opt-in on record for this student, and no opt-out on the phone */
    private function optedIn(int $studentId, string $phone): bool
    {
        return Consent::where('student_id', $studentId)->where('type', 'sms')->where('status', 'granted')->exists() && $this->consents->allowsSms($phone);
    }

    private function resultText(Exam $exam, Student $s, array $row, float $full): string
    {
        $locale = $this->sms->localeFor($s->primaryParent(), Tenancy::current());
        $n = fn ($v) => rtrim(rtrim(number_format((float) $v, 2, '.', ''), '0'), '.');
        $gpa = app(InstitutionSettings::class)->general(Tenancy::current())['use_gpa'] ? ($this->exams->sheet($exam, $s, true)['total']['gpa'] ?? null) : null;
        return __('sms.result', ['institution' => Tenancy::current()->name, 'name' => $s->user?->name, 'exam' => $exam->name, 'total' => $n($row['total']),
            'full' => $n($full), 'percentage' => $n($row['percentage']), 'rank' => $row['rank']], $locale)
            . ($gpa !== null ? ' ' . __('sms.result_gpa', ['gpa' => number_format((float) $gpa, 2)], $locale) : '');
    }
}

<?php

namespace Tests\Feature\Exams;

use App\Models\{ExamMarkSubmission, Result};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D162: draft -> submit to the head (every student marked or absent) -> locked for the teacher -> update request -> approve
// (edit, submit again) or reject (still locked); the admin edits at any state and may reopen; publishing is not blocked but warns;
// a subject with hand-set parts and no paper link works the same, and OMR import needs a link.
class MarkSubmissionTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private function bulk(array $s, int $exam, $as, array $rows)
    {
        return $this->api('POST', $s['host'], 'results/bulk', $as, ['exam_id' => $exam, 'subject_id' => $s['bangla']->id, 'rows' => $rows]);
    }

    private function flow(array $s, int $exam, $as, string $action, array $extra = [])
    {
        return $this->api('POST', $s['host'], "exams/{$exam}/subjects/{$s['bangla']->id}/submission", $as, ['action' => $action] + $extra);
    }

    public function test_draft_submit_request_approve_resubmit_and_reject(): void
    {
        $s = $this->school('marksub');
        $exam = $this->exam($s);
        $t = $s['karimUser'];
        $this->api('GET', $s['host'], "exams/{$exam}/subjects/{$s['bangla']->id}/entry", $t)->assertOk()->assertJsonPath('data.submission.status', 'draft');
        $this->bulk($s, $exam, $t, [['student_id' => $s['mine']->id, 'marks_obtained' => 70], ['student_id' => $s['sister']->id, 'is_absent' => true]])->assertOk();
        $this->bulk($s, $exam, $t, [['student_id' => $s['mine']->id, 'marks_obtained' => 72]])->assertOk();   // a draft is saved as often as needed

        $this->flow($s, $exam, $t, 'submit')->assertStatus(422)->assertJsonPath('error', 'marks_incomplete');   // Other has no mark yet
        $this->bulk($s, $exam, $t, [['student_id' => $s['other']->id, 'marks_obtained' => 50]])->assertOk();
        $this->flow($s, $exam, $s['otherUser'], 'submit')->assertForbidden();                                   // not their subject
        $this->flow($s, $exam, $t, 'submit')->assertOk()->assertJsonPath('data.status', 'submitted');
        $this->assertSame(1, $s['admin']->fresh()->notifications()->count(), 'the head is told in-app');

        $this->bulk($s, $exam, $t, [['student_id' => $s['mine']->id, 'marks_obtained' => 75]])->assertStatus(422)->assertJsonPath('error', 'marks_submitted');
        $rid = Tenancy::as($s['i'], fn () => Result::where('student_id', $s['mine']->id)->where('subject_id', $s['bangla']->id)->value('id'));
        $this->api('PUT', $s['host'], "results/{$rid}", $t, ['marks_obtained' => 75])->assertStatus(422)->assertJsonPath('error', 'marks_submitted');

        $this->flow($s, $exam, $t, 'request')->assertStatus(422);                                              // a reason is required
        $this->flow($s, $exam, $t, 'approve')->assertStatus(422)->assertJsonPath('error', 'marks_submission_state');   // a teacher never approves
        $this->flow($s, $exam, $t, 'request', ['reason' => 'Roll 1 mark typed wrong'])->assertOk()->assertJsonPath('data.status', 'unlock_requested');
        $this->bulk($s, $exam, $t, [['student_id' => $s['mine']->id, 'marks_obtained' => 75]])->assertStatus(422);
        $this->flow($s, $exam, $s['admin'], 'reject', ['note' => 'Check again'])->assertOk()->assertJsonPath('data.status', 'submitted');
        $this->assertSame(1, $t->fresh()->notifications()->count());
        $this->bulk($s, $exam, $t, [['student_id' => $s['mine']->id, 'marks_obtained' => 75]])->assertStatus(422);

        $this->flow($s, $exam, $t, 'request', ['reason' => 'Roll 1 mark typed wrong'])->assertOk();
        $this->flow($s, $exam, $s['admin'], 'approve')->assertOk()->assertJsonPath('data.status', 'unlocked');
        $this->bulk($s, $exam, $t, [['student_id' => $s['mine']->id, 'marks_obtained' => 75]])->assertOk();
        $this->flow($s, $exam, $t, 'submit')->assertOk()->assertJsonPath('data.status', 'submitted');

        // the admin edits at any state and may return it to draft
        $this->bulk($s, $exam, $s['admin'], [['student_id' => $s['mine']->id, 'marks_obtained' => 76]])->assertOk();
        $this->flow($s, $exam, $s['admin'], 'reopen')->assertOk()->assertJsonPath('data.status', 'draft');
        $this->bulk($s, $exam, $t, [['student_id' => $s['mine']->id, 'marks_obtained' => 77]])->assertOk();
    }

    public function test_publish_is_not_blocked_but_lists_unsubmitted_subjects(): void
    {
        $s = $this->school('marksubpub');
        $exam = $this->exam($s);
        $this->bulk($s, $exam, $s['admin'], [['student_id' => $s['mine']->id, 'marks_obtained' => 60]])->assertOk();
        $out = $this->api('POST', $s['host'], "exams/{$exam}/publish", $s['admin'])->assertOk()->json('unsubmitted');
        $this->assertEqualsCanonicalizing([$s['bangla']->id, $s['physics']->id], array_column($out, 'subject_id'));
        $this->flow($s, $exam, $s['karimUser'], 'submit')->assertStatus(422)->assertJsonPath('error', 'exam_published');
        $this->assertSame(0, Tenancy::as($s['i'], fn () => ExamMarkSubmission::count()));
    }

    public function test_hand_set_parts_without_a_paper_take_marks_and_json_mcq_but_not_omr(): void
    {
        $s = $this->school('marksubparts');
        $exam = $this->exam($s);                                                     // Physics: written 70 + MCQ 30 set by hand, no paper
        $p = $s['physics']->id;
        $this->api('POST', $s['host'], 'results/bulk', $s['admin'], ['exam_id' => $exam, 'subject_id' => $p, 'rows' => [
            ['student_id' => $s['mine']->id, 'components' => ['written' => 50, 'mcq' => 20]]]])->assertOk();
        $this->api('POST', $s['host'], "exams/{$exam}/subjects/{$p}/mcq-import", $s['admin'], ['source' => 'json', 'save' => true,
            'rows' => [['id' => $s['other']->student_id, 'mcq' => 25]]])->assertOk()->assertJsonPath('data.saved', 1);
        $this->api('POST', $s['host'], "exams/{$exam}/subjects/{$p}/mcq-import", $s['admin'], ['source' => 'omr'])->assertStatus(422);
    }
}

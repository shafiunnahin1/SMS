<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{AuditLog, QbOmrForm, QbOmrScan, QbPaper, QbPaperRevision, QbPaperVariant, QbQuestion, QbQuestionOption, QbQuestionType, QbSubject, QbUnlock, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D180 QBO.2: a final paper's settings block stays editable as immutable revisions - a changed save makes the next revision with its
// own sets (old revisions, their sets, OMR forms and scans never change); the same values make none; questions, sections and marks
// stay locked; an older revision still prints as it was; each revision gets its own OMR form; ownership and tenancy as before.
class QbPaperRevisionTest extends TestCase
{
    use RefreshDatabase;

    private array $mcqs = [];

    protected function setUp(): void
    {
        parent::setUp();
        $super = User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000031', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $type = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq'])->id;
        $subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths'])->id;
        foreach ([1, 2, 3] as $n) {
            $q = QbQuestion::create(['qb_question_type_id' => $type, 'qb_subject_id' => $subject, 'question_text' => "Q{$n}?", 'status' => 'published', 'created_by' => $super->id]);
            foreach ([0, 1, 2, 3] as $o) QbQuestionOption::create(['qb_question_id' => $q->id, 'label' => 'x', 'content_text' => "o{$o}", 'is_correct' => $o === 0, 'sort_order' => $o]);
            $this->mcqs[] = $q->id;
        }
    }

    private function finalPaper($i, User $teacher): int
    {
        Tenancy::as($i, fn () => array_map(fn ($id) => QbUnlock::create(['item_type' => 'question', 'item_id' => $id, 'unlocked_by' => $teacher->id, 'price' => '0.00', 'reason' => 'free']), $this->mcqs));
        $id = $this->api('POST', $this->hostOf($i), 'question-bank/papers', $teacher, ['title' => 'Weekly', 'exam_name' => 'Unit 1', 'duration_minutes' => 30, 'sets_count' => 2,
            'sections' => [['title' => 'MCQ', 'items' => array_map(fn ($q) => ['qb_question_id' => $q, 'marks' => '1'], $this->mcqs)]]])->assertCreated()->json('data.id');
        $this->api('POST', $this->hostOf($i), "question-bank/papers/{$id}/finalize", $teacher)->assertOk();
        return $id;
    }

    public function test_a_changed_setting_makes_a_new_revision_and_never_touches_the_old_one(): void
    {
        $i = $this->makeInstitution('qb-revise');
        $teacher = $this->makeUser($i, 'teacher');
        $host = $this->hostOf($i);
        $id = $this->finalPaper($i, $teacher);
        $rev1 = Tenancy::as($i, fn () => QbPaperRevision::where('qb_paper_id', $id)->sole());
        $this->assertSame(1, $rev1->revision_number);
        $this->assertSame('Weekly', $rev1->settings_json['title']);
        $old = Tenancy::as($i, fn () => QbPaperVariant::where('qb_paper_revision_id', $rev1->id)->orderBy('variant_number')->get(['id', 'code', 'layout_json'])->toArray());
        $this->assertCount(2, $old);
        $form = Tenancy::as($i, fn () => QbOmrForm::create(['institution_id' => $i->id, 'qb_paper_id' => $id, 'code' => 'OLDFORM001', 'settings_json' => ['title' => 'x'], 'layout_version' => 1]));
        $scan = Tenancy::as($i, fn () => QbOmrScan::create(['institution_id' => $i->id, 'qb_omr_form_id' => $form->id, 'layout_version' => 1, 'status' => 'needs_review', 'source' => 'browser']));
        $this->assertSame($rev1->id, (int) $form->qb_paper_revision_id);

        // the same values: no revision
        $same = ['title' => 'Weekly', 'exam_name' => 'Unit 1', 'duration_minutes' => 30, 'sets_count' => 2, 'instructions_json' => null];
        $this->api('PUT', $host, "question-bank/papers/{$id}", $teacher, $same)->assertOk();
        $this->assertSame(1, Tenancy::as($i, fn () => QbPaperRevision::where('qb_paper_id', $id)->count()));

        // three sets and a new title: revision 2 with its own three sets; revision 1 and its sets, form and scan unchanged
        $this->api('PUT', $host, "question-bank/papers/{$id}", $teacher, ['sets_count' => 3, 'title' => 'Weekly (retake)'] + $same)
            ->assertOk()->assertJsonPath('data.title', 'Weekly (retake)')->assertJsonPath('data.revision', 2)->assertJsonPath('data.status', 'final')->assertJsonCount(3, 'data.sets');
        $rev2 = Tenancy::as($i, fn () => QbPaperRevision::where('qb_paper_id', $id)->where('revision_number', 2)->sole());
        $this->assertSame(3, Tenancy::as($i, fn () => QbPaperVariant::where('qb_paper_revision_id', $rev2->id)->count()));
        $this->assertSame($old, Tenancy::as($i, fn () => QbPaperVariant::where('qb_paper_revision_id', $rev1->id)->orderBy('variant_number')->get(['id', 'code', 'layout_json'])->toArray()));
        $this->assertSame('Weekly', $rev1->fresh()->settings_json['title']);
        $this->assertSame($rev1->id, (int) $form->fresh()->qb_paper_revision_id);
        $this->assertSame($form->id, (int) $scan->fresh()->qb_omr_form_id);
        $this->assertNull(Tenancy::as($i, fn () => QbOmrForm::current(QbPaper::find($id))->first()), 'the new revision has no OMR form until one is made');
        $audit = Tenancy::as($i, fn () => AuditLog::where('action', 'qb.paper.revised')->latest('id')->first());
        $this->assertSame(['title', 'sets_count'], $audit->new_data['changed']);

        // an older revision prints with its own settings and sets; none named = the latest
        $this->api('GET', $host, "question-bank/papers/{$id}/pdf?revision=1&set=2&format=json", $teacher)->assertOk()->assertJsonPath('data.title', 'Weekly')->assertJsonPath('data.revision', 1);
        $this->api('GET', $host, "question-bank/papers/{$id}/pdf?revision=1&set=3&format=json", $teacher)->assertStatus(422)->assertJsonPath('error', 'qb_no_such_set');
        $this->api('GET', $host, "question-bank/papers/{$id}/pdf?set=3&format=json", $teacher)->assertOk()->assertJsonPath('data.title', 'Weekly (retake)')->assertJsonPath('data.revision', 2);
        $this->api('GET', $host, "question-bank/papers/{$id}/pdf?revision=9&format=json", $teacher)->assertStatus(422)->assertJsonPath('error', 'qb_no_such_revision');

        // the history, newest first, with what each changed
        $list = $this->api('GET', $host, "question-bank/papers/{$id}/revisions", $teacher)->assertOk()->json('data');
        $this->assertSame([2, 1], array_column($list, 'number'));
        $this->assertSame(['title', 'sets_count'], $list[0]['changed']);
        $this->assertSame([3, 2], array_column($list, 'sets'));
    }

    public function test_questions_sections_and_marks_stay_locked_and_ownership_holds(): void
    {
        $i = $this->makeInstitution('qb-revise-lock');
        $teacher = $this->makeUser($i, 'teacher');
        $other = User::create(['institution_id' => $i->id, 'name' => 'Other', 'role' => 'teacher', 'phone' => '01700000032', 'password' => 'Teacher-pass-2026', 'is_active' => true]);
        $host = $this->hostOf($i);
        $id = $this->finalPaper($i, $teacher);
        $this->api('PUT', $host, "question-bank/papers/{$id}", $teacher, ['title' => 'X', 'sections' => [['title' => 'MCQ', 'items' => [['qb_question_id' => $this->mcqs[0], 'marks' => '5']]]]])
            ->assertStatus(422)->assertJsonPath('error', 'qb_paper_final');
        $this->api('PUT', $host, "question-bank/papers/{$id}", $other, ['title' => 'Mine now'])->assertNotFound();
        $this->api('GET', $host, "question-bank/papers/{$id}/revisions", $other)->assertNotFound();
        $this->api('PUT', $host, "question-bank/papers/{$id}", $this->makeUser($i, 'admin'), ['title' => 'Head teacher edit', 'sets_count' => 2])->assertOk()->assertJsonPath('data.revision', 2);
        $this->assertSame(2, Tenancy::as($i, fn () => QbPaperRevision::where('qb_paper_id', $id)->count()));
        $this->expectException(\LogicException::class);
        Tenancy::as($i, fn () => QbPaperRevision::where('qb_paper_id', $id)->first()->update(['settings_json' => []]));   // immutable
    }
}

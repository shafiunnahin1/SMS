<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbCreativePart, QbQuestionItem, QbQuestionStimulus, QbPaper, QbPrice, QbQuestion, QbQuestionOption, QbQuestionType, QbSubject, QbUnlock, User};
use App\Services\PdfService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// QB.8 (D66, docs/modules/question-bank.md §3চ, §5): a teacher builds a paper from bought questions only (a not-yet-bought one is
// 422 with the ids and total, buy-many buys them); the head teacher sees every paper; a final paper prints in Bengali, set B
// shuffled the same way every time, answers only on request.
class QbPaperTest extends TestCase
{
    use RefreshDatabase;

    private User $super;
    private QbQuestion $mcq;
    private QbQuestion $creative;

    protected function setUp(): void
    {
        parent::setUp();
        $this->super = User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000009', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $mcqType = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq'])->id;
        $creType = QbQuestionType::create(['slug' => 'creative', 'name_bn' => 'সৃজনশীল', 'name_en' => 'Creative', 'family' => 'creative'])->id;
        $subject = QbSubject::create(['name_bn' => 'পদার্থবিজ্ঞান', 'name_en' => 'Physics'])->id;
        foreach ([[$mcqType, '0.50'], [$creType, '2.00']] as [$t, $a]) QbPrice::create(['audience' => 'institution', 'item_kind' => 'question_answer', 'qb_question_type_id' => $t, 'amount' => $a, 'effective_from' => now()->subDay(), 'created_by' => $this->super->id]);
        $this->mcq = QbQuestion::create(['qb_question_type_id' => $mcqType, 'qb_subject_id' => $subject, 'question_text' => 'বেগের একক কোনটি?', 'status' => 'published', 'created_by' => $this->super->id]);
        foreach (['মিটার/সেকেন্ড' => true, 'কিলোগ্রাম' => false, 'নিউটন' => false, 'জুল' => false] as $text => $ok) {
            QbQuestionOption::create(['qb_question_id' => $this->mcq->id, 'label' => 'x', 'content_text' => $text, 'is_correct' => $ok]);
        }
        $this->creative = QbQuestion::create(['qb_question_type_id' => $creType, 'qb_subject_id' => $subject, 'question_text' => 'একটি গাড়ি ১০ সেকেন্ডে ১০০ মিটার যায়।',
            'status' => 'published', 'created_by' => $this->super->id]);
        QbCreativePart::create(['qb_question_id' => $this->creative->id, 'part_label' => 'ক', 'cognitive_level' => 'knowledge', 'marks' => 1, 'question_text' => 'বেগ কী?', 'answer_text' => 'SECRET-PART']);
    }

    private function body(array $extra = []): array
    {
        return array_merge(['title' => 'অর্ধবার্ষিক পরীক্ষা', 'exam_name' => 'পদার্থবিজ্ঞান', 'duration_minutes' => 60, 'sets_count' => 2, 'sections' => [
            ['title' => 'ক-বিভাগ: বহুনির্বাচনী', 'items' => [['qb_question_id' => $this->mcq->id, 'marks' => '1']]],
            ['title' => 'খ-বিভাগ: সৃজনশীল', 'items' => [['qb_question_id' => $this->creative->id, 'marks' => '10']]],
        ]], $extra);
    }

    private function html(int $paperId, string $set, bool $answers, $institution, User $as): string
    {
        $this->bindTenant($institution);
        $this->actingAs($as);
        $fake = new class extends PdfService {
            public ?string $html = null;
            public function render(string $view, array $data = [], string $paper = 'a4', string $orientation = 'portrait', bool $qbankFigures = false): string
            {
                $this->html = view($view, $data + ['institution' => Tenancy::current(), 'theme' => app(\App\Services\ThemeService::class)->getTheme(Tenancy::current()),
                    'locale' => 'bn', 'dir' => 'ltr', 'logo' => null])->render();
                return '%PDF';
            }
        };
        $request = \Illuminate\Http\Request::create('/', 'GET', ['set' => $set, 'answers' => $answers ? '1' : '0']);
        $request->setUserResolver(fn () => $as);
        app(\App\Http\Controllers\QuestionBank\QbPaperController::class)->pdf($request, $paperId, $fake);
        return $fake->html;
    }

    public function test_unbought_questions_block_the_paper_until_bought(): void
    {
        $i = $this->makeInstitution('qbpaper');
        $i->forceFill(['sms_balance' => '10.00'])->save();
        $host = $this->hostOf($i);
        $teacher = $this->makeUser($i, 'teacher');

        $r = $this->api('POST', $host, 'question-bank/papers', $teacher, $this->body())->assertStatus(422)->assertJsonPath('error', 'qb_paper_unbought');
        $this->assertEqualsCanonicalizing([$this->mcq->id, $this->creative->id], $r->json('data.ids'));
        $this->assertSame('2.50', $r->json('data.total'));
        $this->api('POST', $host, 'question-bank/buy-many', $teacher, ['question_ids' => $r->json('data.ids')])->assertOk()
            ->assertJsonPath('data.charged', '2.50')->assertJsonPath('data.balance', '7.50');

        $p = $this->api('POST', $host, 'question-bank/papers', $teacher, $this->body())->assertCreated()->json('data');
        $this->assertSame(['11.00', 'draft', 2], [$p['total_marks'], $p['status'], count($p['sections'])]);
        $this->api('POST', $host, 'question-bank/papers', $teacher, $this->body(['sections' => [['title' => 'x', 'items' => [
            ['qb_question_id' => $this->mcq->id, 'marks' => '1'], ['qb_question_id' => $this->mcq->id, 'marks' => '1']]]]]))->assertStatus(422);   // twice
        $this->api('POST', $host, 'question-bank/papers', $teacher, $this->body(['total_marks' => '99']))->assertStatus(422);              // the server sums marks
    }

    public function test_teachers_see_their_own_the_head_teacher_sees_all_and_final_is_locked(): void
    {
        $i = $this->makeInstitution('qbpaper2');
        $host = $this->hostOf($i);
        $admin = $this->makeUser($i, 'admin');
        $t1 = $this->makeUser($i, 'teacher');
        $t2 = User::create(['institution_id' => $i->id, 'name' => 't2', 'email' => 't2-qbpaper@example.test', 'role' => 'teacher', 'password' => 'Teacher-pass-26', 'is_active' => true]);
        Tenancy::as($i, function () use ($admin) {
            foreach ([$this->mcq, $this->creative] as $q) QbUnlock::create(['item_type' => 'question', 'item_id' => $q->id, 'unlocked_by' => $admin->id, 'price' => '0.00', 'reason' => 'free']);
        });
        $id = $this->api('POST', $host, 'question-bank/papers', $t1, $this->body())->assertCreated()->json('data.id');
        $this->api('GET', $host, "question-bank/papers/{$id}", $t2)->assertNotFound();
        $this->assertSame([], $this->api('GET', $host, 'question-bank/papers', $t2)->json('data'));
        $this->assertSame([$id], array_column($this->api('GET', $host, 'question-bank/papers', $admin)->json('data'), 'id'));

        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $t1)->assertOk()->assertJsonPath('data.status', 'final');
        $this->api('PUT', $host, "question-bank/papers/{$id}", $t1, $this->body())->assertStatus(422)->assertJsonPath('error', 'qb_paper_final');
        $this->api('DELETE', $host, "question-bank/papers/{$id}", $t1)->assertStatus(422);
        $empty = $this->api('POST', $host, 'question-bank/papers', $t1, ['title' => 'x', 'sections' => [['title' => 'a', 'items' => []]]])->assertCreated()->json('data.id');
        $this->api('POST', $host, "question-bank/papers/{$empty}/finalize", $t1)->assertStatus(422)->assertJsonPath('error', 'qb_paper_empty');
        $this->api('DELETE', $host, "question-bank/papers/{$empty}", $t1)->assertOk();
        $this->assertSame(1, Tenancy::as($i, fn () => QbPaper::count()));
    }

    public function test_the_paper_prints_in_bengali_with_sets_and_answers_on_request(): void
    {
        $i = $this->makeInstitution('qbpaper3');
        $admin = $this->makeUser($i, 'admin');
        Tenancy::as($i, function () use ($admin) {
            foreach ([$this->mcq, $this->creative] as $q) QbUnlock::create(['item_type' => 'question', 'item_id' => $q->id, 'unlocked_by' => $admin->id, 'price' => '0.00', 'reason' => 'free']);
        });
        $id = $this->api('POST', $this->hostOf($i), 'question-bank/papers', $admin, $this->body())->assertCreated()->json('data.id');

        $plain = $this->html($id, 'A', false, $i, $admin);
        foreach (['অর্ধবার্ষিক পরীক্ষা', 'ক-বিভাগ: বহুনির্বাচনী', 'খ-বিভাগ: সৃজনশীল', 'বেগের একক কোনটি?', 'মিটার/সেকেন্ড', 'বেগ কী?', 'পূর্ণমান: 11'] as $text) $this->assertStringContainsString($text, $plain);
        $this->assertStringNotContainsString('SECRET-PART', $plain);
        $this->assertStringNotContainsString('✓', $plain);
        $this->assertStringContainsString('SECRET-PART', $this->html($id, 'A', true, $i, $admin));
        $this->assertStringNotContainsString('SECRET-PART', $this->api('GET', $this->hostOf($i), "question-bank/papers/{$id}/pdf?format=json", $admin)->getContent());
        $this->assertStringContainsString('SECRET-PART', $this->api('GET', $this->hostOf($i), "question-bank/papers/{$id}/pdf?format=json&answers=1", $admin)->getContent());

        $json = fn ($set) => $this->api('GET', $this->hostOf($i), "question-bank/papers/{$id}/pdf?set={$set}&format=json", $admin)->assertOk()->json('data.sections.0.items.0.question.options');
        $a = array_column($json('A'), 'content_text');
        $b = array_column($json('B'), 'content_text');
        $this->assertSame(['মিটার/সেকেন্ড', 'কিলোগ্রাম', 'নিউটন', 'জুল'], $a);
        $this->assertEqualsCanonicalizing($a, $b);
        $this->assertNotSame($a, $b, 'set B shuffles the options');
        $this->assertSame($b, array_column($json('B'), 'content_text'), 'the same shuffle every time');
        $this->assertSame(['ক', 'খ', 'গ', 'ঘ'], array_column($json('B'), 'label'), 'relabelled by position');
    }

    // owner request 2026-10-24: the heading's class (most of the questions' class) and subjects load by themselves, in the preview and on the OMR
    public function test_the_heading_loads_the_class_and_subjects_by_itself(): void
    {
        $class = \App\Models\QbClassLevel::create(['name_bn' => 'অষ্টম শ্রেণি', 'name_en' => 'Class 8', 'sort_order' => 8]);
        foreach ([$this->mcq, $this->creative] as $q) $q->classLevels()->attach($class->id);
        $i = $this->makeInstitution('qbpaperhead');
        $admin = $this->makeUser($i, 'admin');
        Tenancy::as($i, function () use ($admin) {
            foreach ([$this->mcq, $this->creative] as $q) QbUnlock::create(['item_type' => 'question', 'item_id' => $q->id, 'unlocked_by' => $admin->id, 'price' => '0.00', 'reason' => 'free']);
        });
        $id = $this->api('POST', $this->hostOf($i), 'question-bank/papers', $admin, $this->body())->assertCreated()->json('data.id');
        $data = $this->api('GET', $this->hostOf($i), "question-bank/papers/{$id}/pdf?format=json", $admin)->assertOk()->json('data');
        $this->assertSame(['অষ্টম শ্রেণি', 'পদার্থবিজ্ঞান'], [$data['class_name'], $data['subject_names']]);
        $lines = Tenancy::as($i, fn () => app(\App\Services\QuestionBank\QbPaperHeader::class)->lines(QbPaper::findOrFail($id), 'School'));
        $this->assertSame(['School', 'পদার্থবিজ্ঞান', 'অষ্টম শ্রেণি', 'পদার্থবিজ্ঞান', 60], [$lines['institution'], $lines['exam'], $lines['class'], $lines['subjects'], $lines['duration_minutes']]);

        // the class picked in the question filter while building wins
        $nine = \App\Models\QbClassLevel::create(['name_bn' => 'নবম শ্রেণি', 'name_en' => 'Class 9', 'sort_order' => 9]);
        $picked = $this->api('POST', $this->hostOf($i), 'question-bank/papers', $admin, $this->body(['instructions_json' => ['class_level_id' => $nine->id]]))->assertCreated()->json('data.id');
        $this->assertSame('নবম শ্রেণি', $this->api('GET', $this->hostOf($i), "question-bank/papers/{$picked}/pdf?format=json", $admin)->json('data.class_name'));
        $this->api('POST', $this->hostOf($i), 'question-bank/papers', $admin, $this->body(['instructions_json' => ['class_level_id' => 999999]]))->assertStatus(422);
    }

    /** R2.1.2 (D114 (1)): structured questions print their passage and every part; answers (matching, order, gap, sub-MCQ)
     *  only on the answer copy */
    public function test_structured_questions_print_their_passage_and_parts(): void
    {
        $type = QbQuestionType::create(['slug' => 'mixed_passage', 'name_bn' => 'অনুচ্ছেদ', 'name_en' => 'Passage', 'family' => 'other', 'ui_config' => ['structure' => 'passage']])->id;
        $q = QbQuestion::create(['qb_question_type_id' => $type, 'qb_subject_id' => $this->mcq->qb_subject_id, 'question_text' => 'Read and answer.', 'status' => 'published', 'created_by' => $this->super->id]);
        $st = QbQuestionStimulus::create(['qb_question_id' => $q->id, 'label' => 'passage', 'content_text' => 'Rahim lives in a village.', 'sort_order' => 1]);
        foreach ([
            ['sub_mcq', 'Where does he live?', ['options' => ['Town', 'Village']], ['correct' => 1], $st->id],
            ['match_pair', 'Dhaka', null, ['right' => 'Bangladesh'], null],
            ['match_pair', 'Delhi', null, ['right' => 'India'], null],
            ['order_step', 'wake up', null, ['position' => 1], null],
            ['order_step', 'go to school', null, ['position' => 2], null],
            ['gap', 'Water boils at', null, ['answers' => ['100 C']], null],
        ] as $k => [$kind, $prompt, $pj, $aj, $stimulus]) {
            QbQuestionItem::create(['qb_question_id' => $q->id, 'qb_question_stimulus_id' => $stimulus, 'item_type' => $kind, 'prompt_text' => $prompt, 'prompt_json' => $pj, 'answer_json' => $aj, 'sort_order' => $k + 1]);
        }
        $i = $this->makeInstitution('qbpaper-structured');
        $admin = $this->makeUser($i, 'admin');
        Tenancy::as($i, fn () => QbUnlock::create(['item_type' => 'question', 'item_id' => $q->id, 'unlocked_by' => $admin->id, 'price' => '0.00', 'reason' => 'free']));
        $id = $this->api('POST', $this->hostOf($i), 'question-bank/papers', $admin, ['title' => 'Structured', 'sections' => [['title' => 'A', 'items' => [['qb_question_id' => $q->id, 'marks' => '6']]]]])
            ->assertCreated()->json('data.id');

        $plain = $this->html($id, 'A', false, $i, $admin);
        foreach (['Rahim lives in a village.', 'Where does he live?', 'Town', 'Village', 'Dhaka', 'Delhi', 'Bangladesh · India', 'wake up', 'go to school', 'Water boils at', '________'] as $text) {
            $this->assertStringContainsString($text, $plain, "printed: {$text}");
        }
        $this->assertStringNotContainsString(__('pdf.qb_paper.answer'), $plain, 'no answers on the question copy');
        $answers = $this->html($id, 'A', true, $i, $admin);
        foreach (['100 C', 'Bangladesh', 'খ'] as $text) $this->assertStringContainsString($text, $answers, "answer: {$text}");
    }
}

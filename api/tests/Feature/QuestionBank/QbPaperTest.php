<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbCreativePart, QbPaper, QbPrice, QbQuestion, QbQuestionOption, QbQuestionType, QbSubject, QbUnlock, User};
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
            public function render(string $view, array $data = [], string $paper = 'a4', string $orientation = 'portrait'): string
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
}

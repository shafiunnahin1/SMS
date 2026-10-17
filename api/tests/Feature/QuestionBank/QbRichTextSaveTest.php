<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbQuestion, QbQuestionOption, QbQuestionType, QbSubject, User};
use Database\Seeders\QbQuestionTypeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D72 (QB.12): what the writers' API stores is qbank's vocabulary only - formatting kept, anything else gone - in the question,
// its options and its parts alike.
class QbRichTextSaveTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_writers_api_keeps_formatting_and_drops_the_rest(): void
    {
        $central = 'admin.' . config('tenancy.base_domain');
        $writer = User::create(['institution_id' => null, 'name' => 'w', 'role' => 'content_writer', 'phone' => '01811111111', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $this->seed(QbQuestionTypeSeeder::class);
        $subject = QbSubject::create(['name_bn' => 'রসায়ন', 'name_en' => 'Chemistry'])->id;
        $q = $this->api('POST', $central, 'writer/questions', $writer, ['qb_question_type_id' => QbQuestionType::where('family', 'mcq')->value('id'), 'qb_subject_id' => $subject,
            'question_text' => 'H<sub>2</sub>O <strong>কী</strong>?<script>alert(1)</script><img src=x onerror=alert(1)>',
            'options' => [['label' => 'ক', 'content_text' => '<span data-qmx-color="#2563eb" onmouseover="x()">পানি</span>', 'is_correct' => true],
                ['label' => 'খ', 'content_text' => '<a href="javascript:x()">লবণ</a>', 'is_correct' => false]]])->assertCreated()->json('data');
        $this->assertSame('H<sub>2</sub>O <strong>কী</strong>?', QbQuestion::find($q['id'])->question_text);
        $this->assertSame(['<span data-qmx-color="#2563eb">পানি</span>', 'লবণ'], QbQuestionOption::where('qb_question_id', $q['id'])->orderBy('sort_order')->pluck('content_text')->all());
    }
}

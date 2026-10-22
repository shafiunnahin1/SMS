<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbChapter, QbClassLevel, QbCurriculumNode, QbCurriculumVersion, QbQuestionType, QbSubject, QbTopic};
use App\Services\QbImportNormalizer;
use App\Support\Toon\ToonDecoder;
use App\Support\Toon\ToonEncoder;
use Database\Seeders\QbQuestionTypeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D123 (R2.1.3): an imported record -> the editor's own body. Every seeded type in Bangla and English is accepted (unlike
// qbank's six); qbank's JSON v5 keys are read; problems are field-path errors, never a silent change of type; the text and
// LaTeX stay exactly as decoded; and the same questions written as TOON give the same records.
class QbImportNormalizerTest extends TestCase
{
    use RefreshDatabase;

    private QbImportNormalizer $n;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(QbQuestionTypeSeeder::class);
        $math = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Mathematics']);
        $ch = QbChapter::create(['qb_subject_id' => $math->id, 'name_bn' => 'বীজগণিত', 'name_en' => 'Algebra']);
        QbTopic::create(['qb_chapter_id' => $ch->id, 'name_bn' => 'সমীকরণ', 'name_en' => 'Equations']);
        QbClassLevel::create(['name_bn' => 'নবম', 'name_en' => 'Class 9', 'education_level' => 'secondary', 'sort_order' => 9]);
        $this->n = new QbImportNormalizer;
    }

    /** the smallest complete record of a type in the import's own keys (qbank-style where qbank has a key) */
    private function record(QbQuestionType $type, string $lang): array
    {
        $q = $lang === 'bn' ? 'নিচের প্রশ্নটির উত্তর দাও: \(x^2 = 4\)' : 'Answer the following: \(x^2 = 4\)';
        $base = ['question_type' => $lang === 'bn' ? $type->name_bn : $type->name_en, 'question_text' => $q, 'language' => $lang,
            'marks' => 2, 'settings' => ['subject' => ['name' => $lang === 'bn' ? 'গণিত' : 'Mathematics'], 'class_levels' => [['name' => 'Class 9']]]];
        return $base + match ($type->ui_config['structure'] ?? null) {
            'gap' => ['items' => [['item_type' => 'gap', 'answer_json' => ['answers' => ['2']]]]],
            'match' => ['items' => [['item_type' => 'match_pair', 'prompt_text' => 'a', 'answer_json' => ['right' => '1']], ['item_type' => 'match_pair', 'prompt_text' => 'b', 'answer_json' => ['right' => '2']]]],
            'order' => ['items' => [['item_type' => 'order_step', 'prompt_text' => 'a', 'answer_json' => ['position' => 1]], ['item_type' => 'order_step', 'prompt_text' => 'b', 'answer_json' => ['position' => 2]]]],
            'passage' => ['stimulus_text' => 'Rahim lives in a village.', 'items' => [['item_type' => 'sub_question', 'stimulus_index' => 0, 'prompt_text' => 'Where?', 'answer_json' => ['answer_text' => 'village']]]],
            'passage_mcq' => ['stimulus_text' => 'Rahim lives in a village.', 'items' => [['item_type' => 'sub_mcq', 'stimulus_index' => 0, 'prompt_text' => 'Where?', 'prompt_json' => ['options' => ['town', 'village']], 'answer_json' => ['correct' => 1]]]],
            default => match ($type->family) {
                'mcq' => ['options' => [['label' => 'ক', 'text' => '\(2\)', 'is_correct' => true], ['label' => 'খ', 'text' => '3', 'is_correct' => false]]],
                'true_false' => ['options' => [['label' => 'T', 'text' => 'True', 'is_correct' => true], ['label' => 'F', 'text' => 'False', 'is_correct' => false]]],
                'creative' => ['stimulus_text' => 'উদ্দীপক', 'creative_parts' => [['label' => 'ক', 'cognitive_level' => 'জ্ঞানমূলক', 'question_text' => 'কী?', 'marks' => 1]]],
                default => ['answer_text' => '2'],
            },
        };
    }

    public function test_every_type_in_bangla_and_english_is_accepted(): void
    {
        $types = QbQuestionType::where('is_active', true)->orderBy('id')->get();
        $this->assertGreaterThanOrEqual(74, $types->count());
        foreach ($types as $type) {
            foreach (['bn', 'en'] as $lang) {
                $r = $this->n->normalize($this->record($type, $lang));
                $this->assertSame([], $r['errors'], "{$type->slug} ({$lang})");
                $this->assertSame($type->slug, $r['type_slug'], "{$type->slug} ({$lang}) keeps its own type");
                $this->assertSame($lang, $r['payload']['language']);
                $this->assertTrue($r['has_math']);
                $this->assertStringContainsString('\(x^2 = 4\)', $r['payload']['question_text'], 'LaTeX unchanged');
            }
        }
    }

    public function test_qbank_v5_shapes_are_read(): void
    {
        $r = $this->n->normalize(['question_type' => 'MCQ', 'question_text' => 'x?', 'difficulty' => 'easy',
            'options' => [['label' => 'ক', 'text' => 'a', 'is_correct' => false], ['label' => 'খ', 'text' => 'b', 'is_correct' => true]],
            'settings' => ['subject' => ['name' => 'Mathematics'], 'chapter' => ['name' => 'বীজগণিত'], 'topic' => ['name' => 'Equations']],
            'figure_descriptions' => [['description' => 'a triangle']]], ['language' => 'English']);
        $this->assertSame([], $r['errors']);
        $this->assertSame(['mcq', 2, 'en'], [$r['type_slug'], $r['payload']['difficulty'], $r['payload']['language']]);
        $this->assertSame(['label' => 'খ', 'content_text' => 'b', 'is_correct' => true], $r['payload']['options'][1]);
        $this->assertSame([['description' => 'a triangle']], $r['payload']['figure_descriptions']);
        $body = $this->n->editorBody($r['payload']);
        $this->assertNotNull($body['qb_topic_id']);

        $creative = $this->n->normalize(['question_type' => 'creative', 'stimulus_text' => 'উদ্দীপক', 'settings' => ['subject' => 'গণিত'],
            'creative_parts' => [['label' => 'ক', 'cognitive_level' => 'knowledge', 'question_text' => 'কী?', 'marks' => 1],
                ['question_text' => 'কেন?', 'marks' => 2]]]);
        $this->assertSame([], $creative['errors']);
        $this->assertSame('উদ্দীপক', $creative['payload']['question_text'], 'the stimulus is the creative question text, as in the editor');
        $this->assertSame(['খ', 'understanding'], [$creative['payload']['creative_parts'][1]['part_label'], $creative['payload']['creative_parts'][1]['cognitive_level']]);
    }

    public function test_language_paper_curriculum_node_ids_are_preserved_and_subject_checked(): void
    {
        $bangla = QbSubject::create(['name_bn' => 'বাংলা ১ম পত্র', 'name_en' => 'Bangla 1st Paper']);
        $english = QbSubject::create(['name_bn' => 'ইংরেজি ১ম পত্র', 'name_en' => 'English 1st Paper']);
        $banglaVersion = QbCurriculumVersion::create(['qb_subject_id' => $bangla->id, 'version_key' => 'bangla-v1', 'name_bn' => 'বাংলা সিলেবাস', 'name_en' => 'Bangla syllabus']);
        $englishVersion = QbCurriculumVersion::create(['qb_subject_id' => $english->id, 'version_key' => 'english-v1', 'name_bn' => 'ইংরেজি সিলেবাস', 'name_en' => 'English syllabus']);
        $banglaNode = QbCurriculumNode::create(['qb_curriculum_version_id' => $banglaVersion->id, 'kind' => 'Text', 'name_bn' => 'অপরিচিতা', 'name_en' => 'Aparichita']);
        $englishNode = QbCurriculumNode::create(['qb_curriculum_version_id' => $englishVersion->id, 'kind' => 'Unit', 'name_bn' => 'ইউনিট ১', 'name_en' => 'Unit 1']);

        foreach ([['বাংলা ১ম পত্র', 'bn', $banglaNode->id], ['English 1st Paper', 'en', $englishNode->id]] as [$subject, $language, $nodeId]) {
            $raw = ['question_type' => 'short', 'question_text' => $language === 'bn' ? 'বাংলা প্রশ্ন' : 'English question', 'language' => $language,
                'settings' => ['subject' => ['name' => $subject]], 'curriculum_node_ids' => [$nodeId]];
            $normalized = $this->n->normalize($raw);
            $this->assertSame([], $normalized['errors']);
            $this->assertSame([$nodeId], $normalized['payload']['curriculum_node_ids']);
            $this->assertSame([$nodeId], $this->n->editorBody($normalized['payload'])['curriculum_node_ids']);
        }

        $wrongSubject = $this->n->normalize(['question_type' => 'short', 'question_text' => 'Question',
            'settings' => ['subject' => ['name' => 'বাংলা ১ম পত্র']], 'curriculum_node_ids' => [$englishNode->id]]);
        $this->assertContains('curriculum_node_ids.0', array_column($wrongSubject['errors'], 'path'));
        $unknown = $this->n->normalize(['question_type' => 'short', 'question_text' => 'Question',
            'settings' => ['subject' => ['name' => 'বাংলা ১ম পত্র']], 'curriculum_node_ids' => [999999]]);
        $this->assertContains('curriculum_node_ids.0', array_column($unknown['errors'], 'path'));
        $legacy = $this->n->normalize(['question_type' => 'short', 'question_text' => 'Question', 'settings' => ['subject' => ['name' => 'Mathematics']]]);
        $this->assertArrayNotHasKey('curriculum_node_ids', $legacy['payload']);
        $this->assertArrayNotHasKey('curriculum_node_ids', $this->n->editorBody($legacy['payload']));
    }

    public function test_problems_are_field_path_errors_never_a_changed_type(): void
    {
        $paths = fn (array $raw) => array_column($this->n->normalize($raw)['errors'], 'path');
        $this->assertSame(['question_type'], $paths(['question_type' => 'riddle', 'question_text' => 'x', 'settings' => ['subject' => 'গণিত']]));
        $this->assertSame(['options'], $paths(['question_type' => 'mcq', 'question_text' => 'x', 'settings' => ['subject' => 'গণিত'],
            'options' => [['text' => 'a', 'is_correct' => false], ['text' => 'b', 'is_correct' => false]]]));
        $this->assertSame(['options'], $paths(['question_type' => 'short', 'question_text' => 'x', 'settings' => ['subject' => 'গণিত'],
            'options' => [['text' => 'a', 'is_correct' => true]]]), 'a short question cannot carry options - not turned into MCQ');
        $this->assertSame(['subject'], $paths(['question_type' => 'short', 'question_text' => 'x']));
        $this->assertSame(['subject', 'class_levels.0'], $paths(['question_type' => 'short', 'question_text' => 'x', 'subject' => 'Physics', 'class_levels' => ['Class 99']]));
        $this->assertSame(['chapter'], $paths(['question_type' => 'short', 'question_text' => 'x', 'subject' => 'গণিত', 'chapter' => 'Geometry']));
        $this->assertSame(['creative_parts.0.marks'], $paths(['question_type' => 'creative', 'question_text' => 'x', 'subject' => 'গণিত',
            'creative_parts' => [['question_text' => 'কী?']]]));
        $this->assertSame(['question_text'], $paths(['question_type' => 'short', 'question_text' => '', 'subject' => 'গণিত']));
        $this->assertSame(['marks'], $paths(['question_type' => 'short', 'question_text' => 'x', 'subject' => 'গণিত', 'marks' => 'two']));
    }

    public function test_json_and_toon_give_the_same_records(): void
    {
        $questions = [];
        foreach (QbQuestionType::orderBy('id')->get() as $type) $questions[] = $this->record($type, $type->id % 2 ? 'bn' : 'en');
        $json = json_decode(json_encode(['schema_version' => 'exam-management.universal-content-json.v5', 'questions' => $questions], JSON_UNESCAPED_UNICODE), true);
        $toon = ToonDecoder::decode(ToonEncoder::encode(['schema_version' => 'exam-management.universal-content-json.v5', 'questions' => $questions]));
        $this->assertSame(count($questions), count($toon['questions']));
        foreach ($json['questions'] as $i => $q) {
            $this->assertSame($this->n->normalize($q), $this->n->normalize($toon['questions'][$i]), "record {$i}");
        }
    }
}

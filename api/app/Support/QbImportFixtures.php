<?php

namespace App\Support;

use App\Models\QbQuestionType;
use App\Services\QbImportService;

// D123 (R2.1.3): a mixed import of any size for the acceptance run - every active type in turn, Bangla and English, LaTeX in
// the text and the options, and every 50th record of an unknown type (an expected, reported failure)
class QbImportFixtures
{
    public const BAD_EVERY = 50;

    public static function mixed(int $count, string $subject, string $tag = ''): array
    {
        $types = QbQuestionType::where('is_active', true)->orderBy('id')->get();
        $questions = [];
        for ($i = 0; $i < $count; $i++) {
            $type = $types[$i % $types->count()];
            $lang = intdiv($i, $types->count()) % 2 ? 'en' : 'bn';
            $q = ($lang === 'bn' ? "প্রশ্ন {$i}{$tag}: \\(\\frac{a}{b} + \\sqrt{{$i}}\\) এর মান কত?" : "Question {$i}{$tag}: find \\(\\frac{a}{b} + \\sqrt{{$i}}\\).");
            $base = ['question_type' => ($i + 1) % self::BAD_EVERY === 0 ? 'riddle' : ($lang === 'bn' ? $type->name_bn : $type->name_en),
                'question_text' => $q, 'language' => $lang, 'marks' => 1 + $i % 5, 'difficulty' => 1 + $i % 5, 'settings' => ['subject' => ['name' => $subject]]];
            $questions[] = $base + match ($type->ui_config['structure'] ?? null) {
                'gap' => ['items' => [['item_type' => 'gap', 'answer_json' => ['answers' => ["{$i}"]]]]],
                'match' => ['items' => [['item_type' => 'match_pair', 'prompt_text' => 'a', 'answer_json' => ['right' => '1']], ['item_type' => 'match_pair', 'prompt_text' => 'b', 'answer_json' => ['right' => '2']]]],
                'order' => ['items' => [['item_type' => 'order_step', 'prompt_text' => 'first', 'answer_json' => ['position' => 1]], ['item_type' => 'order_step', 'prompt_text' => 'second', 'answer_json' => ['position' => 2]]]],
                'passage' => ['stimulus_text' => "Passage {$i}", 'items' => [['item_type' => 'sub_question', 'stimulus_index' => 0, 'prompt_text' => 'Why?', 'answer_json' => ['answer_text' => 'Because.']]]],
                'passage_mcq' => ['stimulus_text' => "Passage {$i}", 'items' => [['item_type' => 'sub_mcq', 'stimulus_index' => 0, 'prompt_text' => 'Which?', 'prompt_json' => ['options' => ['x', 'y']], 'answer_json' => ['correct' => 0]]]],
                default => match ($type->family) {
                    'mcq' => ['options' => [['label' => 'ক', 'text' => "\\({$i}\\)", 'is_correct' => true], ['label' => 'খ', 'text' => '\(x^2\)', 'is_correct' => false]]],
                    'true_false' => ['options' => [['label' => 'T', 'text' => 'True', 'is_correct' => true], ['label' => 'F', 'text' => 'False', 'is_correct' => false]]],
                    'creative' => ['stimulus_text' => "উদ্দীপক {$i}", 'creative_parts' => [['label' => 'ক', 'cognitive_level' => 'knowledge', 'question_text' => 'কী?', 'marks' => 1]]],
                    default => ['answer_text' => "\\({$i}\\)"],
                },
            };
        }
        return ['schema_version' => QbImportService::SCHEMA_V5, 'questions' => $questions];
    }
}

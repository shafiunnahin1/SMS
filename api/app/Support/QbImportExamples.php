<?php

namespace App\Support;

use App\Models\QbQuestionType;
use App\Services\QbImportService;

// D123 (R2.1.3): the downloadable import schema and one example - the same questions serve as example.json and example.toon
class QbImportExamples
{
    public static function example(): array
    {
        $subject = ['name' => 'Mathematics'];
        return ['schema_version' => QbImportService::SCHEMA_V5, 'document' => ['title' => 'Example', 'language' => 'bn'], 'questions' => [
            ['question_type' => 'mcq', 'question_text' => '\(x^2 = 9\) হলে \(x\) এর মান কত?', 'marks' => 1, 'difficulty' => 2,
                'options' => [['label' => 'ক', 'text' => '\(\pm 3\)', 'is_correct' => true], ['label' => 'খ', 'text' => '\(3\)', 'is_correct' => false],
                    ['label' => 'গ', 'text' => '\(9\)', 'is_correct' => false], ['label' => 'ঘ', 'text' => '\(-9\)', 'is_correct' => false]],
                'explanation_text' => '\(x = \pm\sqrt{9}\)', 'settings' => ['subject' => $subject, 'class_levels' => [['name' => 'Class 9']], 'chapter' => ['name' => 'Algebra']]],
            ['question_type' => 'creative', 'stimulus_text' => 'একটি আয়তক্ষেত্রের দৈর্ঘ্য প্রস্থের দ্বিগুণ এবং পরিসীমা ৩০ সেমি।', 'settings' => ['subject' => $subject],
                'creative_parts' => [['label' => 'ক', 'cognitive_level' => 'knowledge', 'question_text' => 'পরিসীমার সূত্র লেখো।', 'marks' => 1],
                    ['label' => 'খ', 'cognitive_level' => 'understanding', 'question_text' => 'দৈর্ঘ্য ও প্রস্থ নির্ণয় করো।', 'marks' => 2],
                    ['label' => 'গ', 'cognitive_level' => 'application', 'question_text' => 'ক্ষেত্রফল নির্ণয় করো।', 'marks' => 3],
                    ['label' => 'ঘ', 'cognitive_level' => 'higher_order', 'question_text' => 'কর্ণের দৈর্ঘ্য নির্ণয় করো।', 'marks' => 4]]],
            ['question_type' => 'fill_in_the_blank', 'language' => 'en', 'question_text' => 'The square root of 16 is ___.', 'settings' => ['subject' => $subject],
                'items' => [['item_type' => 'gap', 'answer_json' => ['answers' => ['4']]]]],
            ['question_type' => 'matching', 'language' => 'en', 'question_text' => 'Match each number with its square.', 'settings' => ['subject' => $subject],
                'items' => [['item_type' => 'match_pair', 'prompt_text' => '2', 'answer_json' => ['right' => '4']], ['item_type' => 'match_pair', 'prompt_text' => '3', 'answer_json' => ['right' => '9']]]],
            ['question_type' => 'seen_passage', 'language' => 'en', 'question_text' => 'Read the passage and answer.', 'stimulus_text' => 'Rahim lives in a village near a river.',
                'settings' => ['subject' => ['name' => 'English']], 'items' => [['item_type' => 'sub_question', 'stimulus_index' => 0, 'prompt_text' => 'Where does Rahim live?', 'answer_json' => ['answer_text' => 'In a village near a river.']]]],
            ['question_type' => 'short', 'language' => 'en', 'question_text' => 'Define a prime number.', 'answer_text' => 'A whole number above 1 whose only divisors are 1 and itself.',
                'settings' => ['subject' => $subject], 'source' => ['board' => 'Dhaka', 'year' => 2024]],
        ]];
    }

    public static function schema(): array
    {
        $ref = ['oneOf' => [['type' => 'string'], ['type' => 'object', 'properties' => ['id' => ['type' => 'integer'], 'name' => ['type' => 'string']]]]];
        return [
            '$schema' => 'https://json-schema.org/draft/2020-12/schema', 'title' => 'SMS question import (JSON or TOON, same fields)',
            'description' => 'qbank universal-content JSON v5 keys. Any question type of the question bank by slug, Bangla or English name. Text is kept exactly (LaTeX as \\( ... \\)). Unknown types or parts a type cannot hold stay in staging with an error.',
            'type' => ['object', 'array'],
            'properties' => [
                'schema_version' => ['const' => QbImportService::SCHEMA_V5],
                'document' => ['type' => 'object', 'properties' => ['title' => ['type' => 'string'], 'language' => ['enum' => ['bn', 'en', 'mixed']]]],
                'questions' => ['type' => 'array', 'items' => ['$ref' => '#/$defs/question']],
            ],
            '$defs' => ['question' => ['type' => 'object', 'required' => ['question_type'], 'properties' => [
                'question_type' => ['enum' => QbQuestionType::where('is_active', true)->orderBy('id')->pluck('slug')->all()],
                'question_text' => ['type' => 'string'], 'stimulus_text' => ['type' => 'string'], 'answer_text' => ['type' => 'string'], 'explanation_text' => ['type' => 'string'],
                'language' => ['enum' => ['bn', 'en', 'mixed']], 'marks' => ['type' => 'number'], 'difficulty' => ['oneOf' => [['type' => 'integer', 'minimum' => 1, 'maximum' => 5], ['enum' => ['easy', 'medium', 'hard']]]],
                'options' => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => ['label' => ['type' => 'string'], 'text' => ['type' => 'string'], 'is_correct' => ['type' => 'boolean']]]],
                'creative_parts' => ['type' => 'array', 'maxItems' => 4, 'items' => ['type' => 'object', 'properties' => ['label' => ['type' => 'string'],
                    'cognitive_level' => ['enum' => ['knowledge', 'understanding', 'application', 'higher_order']], 'question_text' => ['type' => 'string'], 'answer_text' => ['type' => 'string'], 'marks' => ['type' => 'number']]]],
                'stimuli' => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => ['label' => ['type' => 'string'], 'content_text' => ['type' => 'string']]]],
                'items' => ['type' => 'array', 'items' => ['type' => 'object', 'required' => ['item_type'], 'properties' => [
                    'item_type' => ['enum' => ['gap', 'match_pair', 'order_step', 'sub_question', 'sub_mcq', 'true_false', 'table_fill', 'match_triple', 'multi_field']],
                    'stimulus_index' => ['type' => 'integer'], 'prompt_text' => ['type' => 'string'], 'prompt_json' => ['type' => 'object'], 'answer_json' => ['type' => 'object'], 'marks' => ['type' => 'number']]]],
                'settings' => ['type' => 'object', 'properties' => ['subject' => $ref, 'chapter' => $ref, 'topic' => $ref, 'class_levels' => ['type' => 'array', 'items' => $ref]]],
                'occurrences' => ['type' => 'array'], 'figure_descriptions' => ['type' => 'array'], 'visuals' => ['type' => 'array'], 'source' => ['type' => 'object'],
            ]]],
        ];
    }
}

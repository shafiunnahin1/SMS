<?php

namespace Database\Seeders;

use App\Models\QbQuestionType;
use Illuminate\Database\Seeder;

// QB.2 (D65): the core question types a writer can file a question under, copied as DATA from the owner's qbank project
// (database/seeders/QuestionTypeSeeder.php at 40f769c: slug, names, order). QB.3 builds their editors; the remaining ~70 qbank types
// arrive with QB.4 / the qbank import (QB.11). The family is this platform's grouping (schema.sql qb_question_types.family).
// Idempotent: matched by slug.
class QbQuestionTypeSeeder extends Seeder
{
    private const TYPES = [
        ['mcq', 'বহুনির্বাচনী প্রশ্ন', 'Multiple Choice Question', 'mcq', 3],
        ['short', 'সংক্ষিপ্ত প্রশ্ন', 'Short Question', 'short', 5],
        ['true_false', 'সত্য / মিথ্যা', 'True / False', 'true_false', 10],
        ['creative', 'সৃজনশীল প্রশ্ন', 'Creative Question', 'creative', 11],
        ['fill_in_the_blank', 'সাধারণ শূন্যস্থান পূরণ', 'Fill in the Blank', 'fill_gap', 40],
    ];

    public function run(): void
    {
        foreach (self::TYPES as [$slug, $bn, $en, $family, $order]) {
            QbQuestionType::firstOrCreate(['slug' => $slug], ['name_bn' => $bn, 'name_en' => $en, 'family' => $family, 'sort_order' => $order]);
        }
    }
}

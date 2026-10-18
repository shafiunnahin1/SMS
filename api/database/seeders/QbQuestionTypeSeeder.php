<?php

namespace Database\Seeders;

use App\Models\QbQuestionType;
use Illuminate\Database\Seeder;

// QB.2 - QB.4 (D65): every question type of the owner's qbank project, copied as DATA into data/qb_question_types.json (slug,
// names, order, and qbank's own structure config in ui_config.qbank). `family` and `ui_config.structure` (gap / match / order /
// passage / passage_mcq) are this platform's grouping - they decide the editor section and what "complete" means at review.
// qbank lists the slug `application` twice (a cognitive-level question, then the letter-writing type); its seeder keeps the later
// one, and so does this file. Idempotent: matched by slug; a row made by an earlier version only gets its missing ui_config.
class QbQuestionTypeSeeder extends Seeder
{
    public function run(): void
    {
        $data = json_decode(file_get_contents(__DIR__ . '/data/qb_question_types.json'), true, flags: JSON_THROW_ON_ERROR);
        foreach ($data['types'] as $t) {
            $row = QbQuestionType::firstOrCreate(['slug' => $t['slug']], ['name_bn' => $t['name_bn'], 'name_en' => $t['name_en'], 'family' => $t['family'],
                'ui_config' => $t['ui_config'], 'is_active' => $t['is_active'], 'sort_order' => $t['sort_order']]);
            if ($row->ui_config === null) $row->forceFill(['ui_config' => $t['ui_config']])->save();
        }
    }
}

<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbOmrForm, QbPaper, QbPaperVariant};
use App\Services\QuestionBank\QbOmrGeometryService;
use Tests\TestCase;

// D127/D128: the printed OMR sheet shows real labels (never a translation key) and each subject's heading over its bubbles
class QbOmrSheetViewTest extends TestCase
{
    public function test_the_sheet_prints_its_labels_and_subject_headings_in_both_languages(): void
    {
        $settings = ['title' => '', 'roll_digits' => 4,   // owner 2026-10-24: an empty title and subtitle load the paper's class and subjects
             'option_count' => 4, 'option_labels' => ['ক', 'খ', 'গ', 'ঘ'], 'page_size' => 'a4', 'page_orientation' => 'portrait',
            'answer_columns' => 'auto', 'question_count' => 6, 'info_boxes' => ['class' => ['visible' => true], 'roll' => ['visible' => true, 'digits' => 4], 'subject' => ['visible' => true], 'set' => ['visible' => true, 'digits' => 1]],
            'subject_blocks' => [['subject_id' => 1, 'start' => 0, 'count' => 3, 'name' => 'গণিত'], ['subject_id' => 2, 'start' => 3, 'count' => 3, 'name' => 'বিজ্ঞান']]];
        $settings['geometry'] = app(QbOmrGeometryService::class)->build(7, $settings);
        foreach (['bn' => 'রোল', 'en' => 'Roll'] as $locale => $roll) {
            app()->setLocale($locale);
            $html = view('pdf.qb-omr-sheet', ['paper' => new QbPaper(['title' => 'P']), 'form' => new QbOmrForm(['code' => 'C1']), 'variant' => new QbPaperVariant(['code' => 'A']),
                'settings' => $settings, 'set_symbols' => range('A', 'J'), 'locale' => $locale, 'dir' => 'ltr',
                'header' => ['institution' => 'Dhanmondi School', 'exam' => 'Test', 'class' => 'অষ্টম শ্রেণি', 'subjects' => 'বাংলা, গণিত', 'duration_minutes' => 180, 'total_marks' => '5.00', 'subject_codes' => ['146', '147']]])->render();
            $this->assertStringNotContainsString('pdf.qb_omr', $html, "{$locale}: no raw translation keys");
            $this->assertStringContainsString($roll, $html);
            $this->assertSame(2, substr_count($html, 'class="subject-heading"'));
            $this->assertSame(2, substr_count($html, '<div class="code-row">' . __('pdf.qb_omr.subject')), "{$locale}: one digit-box row per subject code");
            foreach (['Dhanmondi School', 'অষ্টম শ্রেণি', 'বাংলা, গণিত', 'class="set-box"'] as $text) $this->assertStringContainsString($text, $html, "{$locale}: the paper's heading is on the sheet");
        }
    }
}

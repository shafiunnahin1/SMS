<?php

namespace Tests\Unit;

use App\Services\QuestionBank\QbOmrGeometryService;
use PHPUnit\Framework\TestCase;

// owner 2026-10-24 (qbank's print view): every page size and orientation has its own full-size layout - a bubble is always 5 mm, nothing
// overlaps or leaves the page, sideways the answers stand beside the code boxes, and content that does not fit is reported, never shrunk
class QbOmrLayoutTest extends TestCase
{
    private function build(string $size, string $orientation, int $questions = 20, string $mode = 'digital'): array
    {
        return (new QbOmrGeometryService())->build(7, ['question_count' => $questions, 'option_count' => 4, 'roll_digits' => 6, 'page_size' => $size,
            'page_orientation' => $orientation, 'entry_mode' => $mode, 'answer_columns' => 'auto',
            'info_boxes' => ['class' => ['visible' => false, 'digits' => 2], 'roll' => ['visible' => true], 'student_id' => ['visible' => true], 'set' => ['visible' => true, 'digits' => 1]]]);
    }

    private static function overlap(array $a, array $b): bool
    {
        return $a['left'] < $b['left'] + $b['width'] - 1e-9 && $b['left'] < $a['left'] + $a['width'] - 1e-9
            && $a['top'] < $b['top'] + $b['height'] - 1e-9 && $b['top'] < $a['top'] + $a['height'] - 1e-9;
    }

    public function test_each_page_keeps_full_size_parts_apart_and_on_the_page(): void
    {
        foreach (['a4', 'legal'] as $size) foreach (['portrait', 'landscape'] as $orientation) {
            $g = $this->build($size, $orientation);
            $label = "{$size} {$orientation}";
            $this->assertTrue($g['fits'], $label);
            [$w, $h] = $g['page_mm'];
            $bubbles = [];
            foreach (['roll', 'student_id', 'set'] as $k) foreach ($g[$k]['rows'] as $row) foreach ($row as $c) $bubbles[] = $c['bubble'];
            foreach ($g['answers']['columns'] as $col) foreach ($col['rows'] as $row) foreach ($row['options'] as $o) $bubbles[] = $o['bubble'];
            foreach ($bubbles as $b) {
                $this->assertEqualsWithDelta(5.0, $b['width'] * $w, 0.001, "{$label}: a bubble is 5 mm wide");
                $this->assertEqualsWithDelta(5.0, $b['height'] * $h, 0.001, "{$label}: and 5 mm high");
            }
            $parts = ['roll' => $g['roll'], 'student_id' => $g['student_id'], 'set' => $g['set'], 'notes' => $g['notes'], 'answers' => $g['answers'], 'heading' => $g['heading']];
            foreach ($parts as $name => $rect) {
                $this->assertGreaterThanOrEqual(0, $rect['left'], "{$label}: {$name} on the page");
                $this->assertLessThanOrEqual(1, $rect['left'] + $rect['width'], "{$label}: {$name} on the page");
                $this->assertLessThan($g['markers']['bottom'], $rect['top'] + $rect['height'], "{$label}: {$name} above the bottom markers");
            }
            $names = array_keys($parts);
            foreach ($names as $i => $a) foreach (array_slice($names, $i + 1) as $b) $this->assertFalse(self::overlap($parts[$a], $parts[$b]), "{$label}: {$a} and {$b} apart");
        }
    }

    public function test_sideways_the_answers_stand_beside_the_code_boxes(): void
    {
        $g = $this->build('a4', 'landscape');
        $this->assertGreaterThan($g['set']['left'] + $g['set']['width'], $g['answers']['left']);
        $this->assertLessThan($g['set']['top'] + $g['set']['height'], $g['answers']['top']);
        $this->assertSame([297.0, 210.0], $g['page_mm']);
    }

    public function test_content_that_does_not_fit_is_reported_not_shrunk(): void
    {
        $this->assertFalse($this->build('a5', 'landscape')['fits'], 'A5 sideways: 20 rows of answers are taller than the page');
        $this->assertFalse($this->build('a4', 'portrait', 90)['fits'], 'A4: 90 questions need more than the page');
        $g = $this->build('a4', 'portrait', 90);
        $this->assertEqualsWithDelta(5.0, $g['answers']['columns'][0]['rows'][0]['options'][0]['bubble']['width'] * 210, 0.001, 'never shrunk');
        $this->assertTrue($this->build('a4', 'portrait', 60)['fits'], 'A4 upright takes 60 questions in three columns');
        $this->assertTrue($this->build('a5', 'portrait', 20, 'manual')['fits'], 'A5 upright: the write-in panel and 20 questions');
    }
}

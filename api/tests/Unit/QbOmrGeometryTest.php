<?php

namespace Tests\Unit;

use App\Services\QuestionBank\QbOmrGeometryService;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

class QbOmrGeometryTest extends TestCase
{
    public function test_version_two_geometry_has_qbank_reader_grids_and_answer_columns(): void
    {
        $geometry = (new QbOmrGeometryService)->build(137, [
            'question_count' => 7,
            'option_count' => 4,
            'roll_digits' => 6,
            'answer_columns' => 'auto',
            'info_boxes' => ['set' => ['digits' => 1]],
        ]);

        $this->assertSame([2, 'omr-page-normalized', true], [$geometry['version'], $geometry['coordinate_space'], $geometry['bubble_only']]);
        $this->assertSame(28, count($geometry['code']['bits']));
        $this->assertSame('1010' . str_pad(decbin(137), 20, '0', STR_PAD_LEFT) . '0101', $geometry['code']['value']);
        $this->assertCount(10, $geometry['class']['rows']);
        $this->assertCount(10, $geometry['roll']['rows']);
        $this->assertCount(10, $geometry['subject']['rows']);
        $this->assertCount(10, $geometry['set']['rows']);
        $this->assertSame(3, $geometry['answers']['column_count']);
        $this->assertCount(3, $geometry['answers']['columns']);
        $this->assertSame([0, 1, 2, 3, 4, 5, 6], array_column(array_merge(...array_column($geometry['answers']['columns'], 'rows')), 'question_index'));

        $rectangles = [$geometry['code'], ...$geometry['code']['bits'], $geometry['answers']];
        foreach ($geometry['answers']['columns'] as $column) {
            $rectangles[] = $column;
            foreach ($column['rows'] as $row) {
                $rectangles[] = $row['number'];
                foreach ($row['options'] as $option) $rectangles[] = $option['bubble'];
            }
        }
        foreach ($rectangles as $rect) {
            $this->assertGreaterThanOrEqual(0, $rect['left']);
            $this->assertGreaterThanOrEqual(0, $rect['top']);
            $this->assertLessThanOrEqual(1, $rect['left'] + $rect['width']);
            $this->assertLessThanOrEqual(1, $rect['top'] + $rect['height']);
        }
    }

    public function test_requested_answer_columns_and_invalid_geometry_inputs_are_bounded(): void
    {
        $builder = new QbOmrGeometryService;
        $geometry = $builder->build(1, ['question_count' => 12, 'option_count' => 5, 'roll_digits' => 12, 'answer_columns' => 8, 'info_boxes' => ['set' => ['digits' => 4]]]);
        $this->assertSame(8, $geometry['answers']['column_count']);
        $this->expectException(InvalidArgumentException::class);
        $builder->build(1, ['question_count' => 0, 'option_count' => 1, 'roll_digits' => 0]);
    }
}
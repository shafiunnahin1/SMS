<?php

namespace App\Services\QuestionBank;

use InvalidArgumentException;

class QbOmrGeometryService
{
    public function build(int $paperId, array $settings): array
    {
        $questionCount = (int) ($settings['question_count'] ?? 0);
        $optionCount = (int) ($settings['option_count'] ?? 0);
        $rollDigits = (int) ($settings['roll_digits'] ?? 0);
        $infoBoxes = $settings['info_boxes'] ?? [];
        $setDigits = (int) ($infoBoxes['set']['digits'] ?? 1);
        [$pageWidth, $pageHeight] = $this->pageDimensions($settings);

        if ($paperId < 1 || $questionCount < 1 || $optionCount < 2 || $optionCount > 5 || $rollDigits < 1 || $rollDigits > 12 || $setDigits < 1 || $setDigits > 4) {
            throw new InvalidArgumentException('Invalid OMR geometry inputs.');
        }

        $code = '1010' . str_pad(decbin($paperId & 0xFFFFF), 20, '0', STR_PAD_LEFT) . '0101';
        $codeWidth = 2.2 / $pageWidth;
        $codeGap = 0.4 / $pageWidth;
        $codeTotalWidth = (28 * $codeWidth) + (27 * $codeGap);
        $codeBits = array_map(fn (int $index): array => $this->rect(0.5 - ($codeTotalWidth / 2) + ($index * ($codeWidth + $codeGap)), 0.095, $codeWidth, 2.2 / $pageHeight), range(0, 27));
        $answerColumns = $this->answerColumns($questionCount, $optionCount, $settings['answer_columns'] ?? 'auto');
        $answerGeometry = $this->answerGeometry($questionCount, $optionCount, $answerColumns, $pageWidth, $pageHeight);

        return [
            'version' => 2,
            'coordinate_space' => 'omr-page-normalized',
            'bubble_only' => true,
            'markers' => ['left' => 0.119, 'right' => 0.881, 'top' => 0.050, 'bottom' => 0.882],
            'code' => $this->bounds($codeBits) + ['bits' => $codeBits, 'value' => $code],
            'class' => $this->numericGrid(0.05 * $pageWidth, 0.17 * $pageHeight, 18, 65, 2, $pageWidth, $pageHeight),
            'roll' => $this->numericGrid(0.20 * $pageWidth, 0.17 * $pageHeight, min(8, max(4, 45 / $rollDigits)) * $rollDigits, 65, $rollDigits, $pageWidth, $pageHeight),
            'subject' => $this->numericGrid(0.52 * $pageWidth, 0.17 * $pageHeight, 21, 65, 3, $pageWidth, $pageHeight),
            'set' => $this->numericGrid(0.70 * $pageWidth, 0.17 * $pageHeight, 8 * $setDigits, 65, $setDigits, $pageWidth, $pageHeight),
            'answers' => $answerGeometry,
        ];
    }

    private function pageDimensions(array $settings): array
    {
        $dimensions = match ($settings['page_size'] ?? 'a4') {
            'a5' => [148.0, 210.0],
            'legal' => [215.9, 355.6],
            default => [210.0, 297.0],
        };
        return ($settings['page_orientation'] ?? 'portrait') === 'landscape' ? [$dimensions[1], $dimensions[0]] : $dimensions;
    }

    private function answerColumns(int $questionCount, int $optionCount, string|int $requested): int
    {
        if ($requested !== 'auto') return min($questionCount, 8, max(1, (int) $requested));
        return $questionCount <= 3 ? max(1, $questionCount) : min(4, max(1, (int) ceil(sqrt($questionCount))));
    }

    private function answerGeometry(int $questionCount, int $optionCount, int $columnCount, float $pageWidth, float $pageHeight): array
    {
        $left = 0.08;
        $top = 0.50;
        $width = 0.84;
        $rowsPerColumn = (int) ceil($questionCount / $columnCount);
        $height = min(0.36, (7 * $rowsPerColumn) / $pageHeight);
        $columnWidth = $width / $columnCount;
        $numberWidth = $columnWidth * 0.24;
        $bubbleWidth = $columnWidth - $numberWidth;
        $rowHeight = $height / $rowsPerColumn;
        $groups = array_chunk(range(0, $questionCount - 1), $rowsPerColumn);
        $columns = [];

        foreach ($groups as $columnIndex => $questionIndexes) {
            $columnLeft = $left + ($columnIndex * $columnWidth);
            $bubbleLeft = $columnLeft + $numberWidth;
            $columnRows = [];
            foreach ($questionIndexes as $rowIndex => $questionIndex) {
                $rowTop = $top + ($rowIndex * $rowHeight);
                $cells = [];
                for ($optionIndex = 0; $optionIndex < $optionCount; $optionIndex++) {
                    $cell = $this->rect($bubbleLeft + ($optionIndex * $bubbleWidth / $optionCount), $rowTop, $bubbleWidth / $optionCount, $rowHeight);
                    $cells[] = ['cell' => $cell, 'bubble' => $this->centeredBubble($cell, $pageWidth, $pageHeight)];
                }
                $columnRows[] = ['question_index' => $questionIndex, 'number' => $this->rect($columnLeft, $rowTop, $numberWidth, $rowHeight), 'options' => $cells];
            }
            $columnBounds = $this->rect($bubbleLeft, $top, $bubbleWidth, count($questionIndexes) * $rowHeight);
            $columns[] = $columnBounds + ['bubbles' => $columnBounds, 'rows' => $columnRows];
        }

        $first = $columns[0];
        $last = $columns[array_key_last($columns)];
        return [
            'left' => $first['left'],
            'top' => $top,
            'width' => ($last['left'] + $last['width']) - $first['left'],
            'height' => $height,
            'column_count' => $columnCount,
            'columns' => $columns,
        ];
    }

    private function numericGrid(float $leftMm, float $topMm, float $widthMm, float $heightMm, int $digitCount, float $pageWidth, float $pageHeight): array
    {
        $left = $leftMm / $pageWidth;
        $top = $topMm / $pageHeight;
        $width = $widthMm / $pageWidth;
        $height = $heightMm / $pageHeight;
        $cellWidth = $width / $digitCount;
        $cellHeight = $height / 10;
        $rows = [];
        $cells = [];

        for ($digit = 0; $digit < 10; $digit++) {
            $row = [];
            for ($column = 0; $column < $digitCount; $column++) {
                $cell = $this->rect($left + ($column * $cellWidth), $top + ($digit * $cellHeight), $cellWidth, $cellHeight);
                $row[] = ['cell' => $cell, 'bubble' => $this->centeredBubble($cell, $pageWidth, $pageHeight)];
                $cells[] = $cell;
            }
            $rows[] = $row;
        }

        return $this->bounds($cells) + ['digit_count' => $digitCount, 'column_count' => $digitCount, 'rows' => $rows];
    }

    private function rect(float $left, float $top, float $width, float $height): array
    {
        return compact('left', 'top', 'width', 'height');
    }

    private function centeredBubble(array $rect, float $pageWidth, float $pageHeight): array
    {
        $width = min($rect['width'], 5 / $pageWidth);
        $height = min($rect['height'], 5 / $pageHeight);
        return $this->rect($rect['left'] + (($rect['width'] - $width) / 2), $rect['top'] + (($rect['height'] - $height) / 2), $width, $height);
    }

    private function bounds(array $rects): array
    {
        $left = min(array_column($rects, 'left'));
        $top = min(array_column($rects, 'top'));
        $right = max(array_map(fn ($rect) => $rect['left'] + $rect['width'], $rects));
        $bottom = max(array_map(fn ($rect) => $rect['top'] + $rect['height'], $rects));
        return $this->rect($left, $top, $right - $left, $bottom - $top);
    }
}
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
        $classDigits = max(1, min(3, (int) ($infoBoxes['class']['digits'] ?? 2)));
        $subjectDigits = max(1, min(4, (int) ($infoBoxes['subject']['digits'] ?? 3)));
        $idBox = isset($infoBoxes['student_id']);                  // D159 (4): new forms print the student ID box where the subject code was
        [$pageWidth, $pageHeight] = $this->pageDimensions($settings);
        $manual = ($settings['entry_mode'] ?? 'digital') === 'manual';

        if ($paperId < 1 || $questionCount < 1 || $optionCount < 2 || $optionCount > 5 || $rollDigits < 1 || $rollDigits > 12 || $setDigits < 1 || $setDigits > 4) {
            throw new InvalidArgumentException('Invalid OMR geometry inputs.');
        }

        $code = '1010' . str_pad(decbin($paperId & 0xFFFFF), 20, '0', STR_PAD_LEFT) . '0101';
        $codeWidth = 2.2 / $pageWidth;
        $codeGap = 0.4 / $pageWidth;
        $codeTotalWidth = (28 * $codeWidth) + (27 * $codeGap);
        // qbank's code bar sits on the line of the top markers, between them
        $codeBits = array_map(fn (int $index): array => $this->rect(0.5 - ($codeTotalWidth / 2) + ($index * ($codeWidth + $codeGap)), 0.05 - (1.1 / $pageHeight), $codeWidth, 2.2 / $pageHeight), range(0, 27));
        $answerColumns = $this->answerColumns($questionCount, $optionCount, $settings['answer_columns'] ?? 'auto');
        $answerGeometry = $this->answerGeometry($questionCount, $optionCount, $answerColumns, $pageWidth, $pageHeight, $settings['subject_blocks'] ?? [], $manual ? 0.37 : 0.448);   // owner 2026-10-24: the one-line heading frees the top - the boxes and answers move up

        return [
            'version' => 2,
            'coordinate_space' => 'omr-page-normalized',
            'bubble_only' => true,
            'markers' => ['left' => 0.119, 'right' => 0.881, 'top' => 0.050, 'bottom' => 0.882],
            'code' => $this->bounds($codeBits) + ['bits' => $codeBits, 'value' => $code],
            ...$this->codeGrids([...(($infoBoxes['class']['visible'] ?? true) === false ? [] : ['class' => $classDigits]),   // owner 2026-10-24: a hidden class box takes no room
                'roll' => $rollDigits, ...($idBox ? ['student_id' => 10] : ['subject' => $subjectDigits]), 'set' => $setDigits], $pageWidth, $pageHeight),
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

    /** D128: a grouped paper gets one heading slot (a row's height) before each subject block; question rows keep their index */
    private function answerGeometry(int $questionCount, int $optionCount, int $columnCount, float $pageWidth, float $pageHeight, array $subjectBlocks = [], float $top = 0.66): array
    {
        $starts = array_column($subjectBlocks, 'name', 'start');
        $slots = [];
        foreach (range(0, $questionCount - 1) as $q) {
            if (array_key_exists($q, $starts)) $slots[] = ['heading' => (string) $starts[$q]];
            $slots[] = ['question' => $q];
        }
        $left = 0.06;
        $width = 0.88;
        $gap = $columnCount > 1 ? 0.015 : 0.0;                    // qbank's answer tables stand apart
        $rowsPerColumn = (int) ceil(count($slots) / $columnCount) + ($subjectBlocks ? 1 : 0);   // room for a heading moved down
        $height = min(0.36, (8 * $rowsPerColumn) / $pageHeight);
        $columnWidth = ($width - ($gap * ($columnCount - 1))) / $columnCount;
        $numberWidth = $columnWidth * 0.165;
        $bubbleWidth = $columnWidth - $numberWidth;
        $rowHeight = $height / $rowsPerColumn;
        $groups = array_chunk($slots, max(1, $rowsPerColumn - ($subjectBlocks ? 1 : 0)));
        for ($g = 0; $g < count($groups) - 1; $g++) {             // a heading never ends a column: it moves to the top of the next one
            if (isset(end($groups[$g])['heading'])) array_unshift($groups[$g + 1], array_pop($groups[$g]));
        }
        $columns = [];

        foreach ($groups as $columnIndex => $questionIndexes) {
            $columnLeft = $left + ($columnIndex * ($columnWidth + $gap));
            $bubbleLeft = $columnLeft + $numberWidth;
            $columnRows = [];
            $headings = [];
            foreach ($questionIndexes as $rowIndex => $slot) {
                $rowTop = $top + ($rowIndex * $rowHeight);
                if (isset($slot['heading'])) { $headings[] = ['label' => $slot['heading'], 'rect' => $this->rect($columnLeft, $rowTop, $columnWidth, $rowHeight)]; continue; }
                $questionIndex = $slot['question'];
                $cells = [];
                for ($optionIndex = 0; $optionIndex < $optionCount; $optionIndex++) {
                    $cell = $this->rect($bubbleLeft + ($optionIndex * $bubbleWidth / $optionCount), $rowTop, $bubbleWidth / $optionCount, $rowHeight);
                    $cells[] = ['cell' => $cell, 'bubble' => $this->centeredBubble($cell, $pageWidth, $pageHeight)];
                }
                $columnRows[] = ['question_index' => $questionIndex, 'number' => $this->rect($columnLeft, $rowTop, $numberWidth, $rowHeight), 'options' => $cells];
            }
            $columnBounds = $this->rect($bubbleLeft, $top, $bubbleWidth, count($questionIndexes) * $rowHeight);
            $columns[] = $columnBounds + ['bubbles' => $columnBounds, 'rows' => $columnRows] + ($headings ? ['headings' => $headings] : []);
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

    /**
     * qbank's code boxes side by side between the left margin and the instructions column (x 0.077 - 0.70 of the page), never
     * overlapping: one digit column is at most 8 mm wide, narrower when many digits must fit, and the space left over is spread
     * evenly between the boxes; ten bubble rows from 23.5% of the page height, under a head cell and a write-in row
     */
    private function codeGrids(array $digits, float $pageWidth, float $pageHeight): array
    {
        $left = 0.077 * $pageWidth;
        $right = 0.70 * $pageWidth;
        $minGap = 4.0;
        $digitWidth = min(8.0, ($right - $left - ($minGap * (count($digits) - 1))) / array_sum($digits));
        $gap = ($right - $left - ($digitWidth * array_sum($digits))) / (count($digits) - 1);
        $grids = [];
        foreach ($digits as $key => $count) {
            $grids[$key] = $this->numericGrid($left, 0.145 * $pageHeight, $digitWidth * $count, 0.245 * $pageHeight, $count, $pageWidth, $pageHeight);
            $left += ($digitWidth * $count) + $gap;
        }
        return $grids;
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
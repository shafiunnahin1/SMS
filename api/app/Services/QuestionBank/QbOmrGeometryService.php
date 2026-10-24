<?php

namespace App\Services\QuestionBank;

use InvalidArgumentException;

/**
 * The OMR sheet's geometry - one source for the printed sheet and the browser reader. Owner 2026-10-24, after qbank's print view: every
 * page size and orientation (A5, A4, Legal x portrait, landscape) has its own layout, and nothing shrinks to a page - every bubble, cell
 * and box keeps its physical size in mm; the layout moves the parts instead (landscape: the code boxes left and the answer tables right;
 * a narrow page: the instructions under the code boxes) and picks as many answer columns as it needs. When the content does not fit the
 * chosen page, `fits` is false and the form cannot be generated. Coordinates are stored normalized to the page (0..1), and the four
 * corner markers' centres are part of the geometry, so the reader maps a photo onto this layout whatever the page.
 */
class QbOmrGeometryService
{
    private const DIGIT_W = 7.0;        // one code-box digit column
    private const DIGIT_H = 7.0;        // one bubble row of a code box (ten rows); 7 x 7 mm keeps the ruled cell clear of the reader's ring
    private const BUBBLE = 5.0;         // every bubble's diameter
    private const HEAD_H = 6.0;         // a code box's head cell
    private const WRITE_H = 7.0;        // the write-in row under it
    private const BOX_GAP = 3.0;        // roll 6 + ID 10 + set 1 at 7 mm fit A5 upright (128 mm) exactly
    private const NOTES_W = 42.0;       // the instructions column
    private const NOTES_BELOW_H = 24.0; // the instructions laid out under the code boxes (narrow page)
    private const ROW_H = 7.0;          // one answer row (qbank 7 mm)
    private const NUMBER_W = 8.0;       // the question-number cell (qbank 8 mm)
    private const OPTION_W = 10.0;      // one answer option cell
    private const TABLE_GAP = 3.0;
    private const TITLE_H = 6.0;        // "MCQ answers" over the tables
    private const TABLE_HEAD_H = 6.0;   // each table's head row (question | answer)
    private const PANEL_W = 112.0;      // manual mode: the write-in candidate panel
    private const PANEL_H = 52.0;
    private const MANUAL_NOTES_W = 50.0;

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
        $manual = ($settings['entry_mode'] ?? 'digital') === 'manual';

        if ($paperId < 1 || $questionCount < 1 || $optionCount < 2 || $optionCount > 5 || $rollDigits < 1 || $rollDigits > 12 || $setDigits < 1 || $setDigits > 4) {
            throw new InvalidArgumentException('Invalid OMR geometry inputs.');
        }

        [$W, $H] = $this->pageDimensions($settings);
        $small = ($settings['page_size'] ?? 'a4') === 'a5';
        $margin = $small ? 5.0 : 10.0;                             // qbank: the printable page inside the paper
        $pad = $small ? 5.0 : 7.0;                                 // and the sheet's own padding
        $landscape = $W > $H;
        $innerLeft = $margin + $pad;
        $innerRight = $W - $margin - $pad;
        $innerW = $innerRight - $innerLeft;
        $markerX = [$margin + 8, $W - $margin - 8];                // 8 mm square markers 4 mm in from the page's corners
        $markerY = [$margin + 8, $H - $margin - 8];
        $bottomLimit = $markerY[1] - 6;                            // the answers end clear of the bottom markers
        $fits = true;
        $n = fn (float $l, float $t, float $w, float $h): array => $this->rect($l / $W, $t / $H, $w / $W, $h / $H);

        // the code bar on the marker line, between the top markers; the one-line heading under it
        $code = '1010' . str_pad(decbin($paperId & 0xFFFFF), 20, '0', STR_PAD_LEFT) . '0101';
        $codeTotal = (28 * 2.2) + (27 * 0.4);
        $codeBits = array_map(fn (int $i): array => $n(($W - $codeTotal) / 2 + $i * 2.6, $markerY[0] - 1.1, 2.2, 2.2), range(0, 27));
        $heading = $n($innerLeft, $markerY[0] + 5, $innerW, 6);
        $infoTop = $markerY[0] + 12;

        // the info block: code boxes (head, write-in row, ten bubble rows) and the instructions beside them, or under them when narrow
        $digits = [...(($infoBoxes['class']['visible'] ?? true) === false ? [] : ['class' => $classDigits]),   // a hidden class box takes no room
            'roll' => $rollDigits, ...($idBox ? ['student_id' => 10] : ['subject' => $subjectDigits]), 'set' => $setDigits];
        $boxesH = self::HEAD_H + self::WRITE_H + 10 * self::DIGIT_H;
        if ($manual) {
            $codesW = self::PANEL_W;
            $codesH = self::PANEL_H;
            $notesW = self::MANUAL_NOTES_W;
        } else {
            $codesW = array_sum($digits) * self::DIGIT_W + self::BOX_GAP * (count($digits) - 1);
            $codesH = $boxesH;
            $notesW = self::NOTES_W;
        }
        // qbank: sideways, the instructions go under the code boxes so the answer tables get the width beside them
        $notesBeside = !$landscape && $codesW + self::BOX_GAP + $notesW <= $innerW;
        if ($codesW > $innerW) $fits = false;
        $infoW = $notesBeside ? $codesW + self::BOX_GAP + $notesW : $codesW;
        $infoH = $notesBeside ? $codesH : $codesH + 3 + self::NOTES_BELOW_H;

        // the answer tables: one table per column, as many columns as the area needs (or as asked)
        $tableW = self::NUMBER_W + self::OPTION_W * $optionCount;
        $answersBeside = $landscape && $infoW + 5 + $tableW <= $innerW;
        if ($answersBeside) {
            $infoLeft = $innerLeft;
            $area = ['left' => $infoLeft + $infoW + 5, 'right' => $innerRight, 'top' => $infoTop];
        } else {
            $infoLeft = $innerLeft + ($innerW - $infoW) / 2;
            $area = ['left' => $innerLeft, 'right' => $innerRight, 'top' => $infoTop + $infoH + 4];
        }
        $codesLeft = $infoLeft;
        $notes = $notesBeside ? $n($codesLeft + $codesW + self::BOX_GAP, $infoTop, $notesW, $codesH)
            : $n($codesLeft, $infoTop + $codesH + 3, $codesW, self::NOTES_BELOW_H);

        $grids = [];
        if ($manual) {
            $panel = $n($codesLeft, $infoTop, self::PANEL_W, self::PANEL_H);
        }
        $left = $codesLeft;
        foreach ($digits as $key => $count) {                      // manual mode keeps the boxes' geometry (never printed) under the panel
            $grids[$key] = $this->numericGrid($left, $infoTop + self::HEAD_H + self::WRITE_H, $count, $W, $H);
            $left += $count * self::DIGIT_W + self::BOX_GAP;
        }

        $slotCount = $questionCount + count($settings['subject_blocks'] ?? []);
        $areaW = $area['right'] - $area['left'];
        $areaH = $bottomLimit - ($area['top'] + self::TITLE_H + self::TABLE_HEAD_H);
        $maxColumns = max(1, min(8, (int) floor(($areaW + self::TABLE_GAP) / ($tableW + self::TABLE_GAP))));
        if ($tableW > $areaW) $fits = false;
        $rowsFor = fn (int $c): int => (int) ceil($slotCount / $c) + (!empty($settings['subject_blocks']) && $c > 1 ? 1 : 0);
        $requested = $settings['answer_columns'] ?? 'auto';
        if ($requested !== 'auto') {
            $columns = min($questionCount, 8, max(1, (int) $requested));
            if ($columns > $maxColumns || $rowsFor($columns) * self::ROW_H > $areaH) $fits = false;
        } else {
            $columns = null;
            for ($c = 1; $c <= min($maxColumns, $questionCount); $c++) {
                if ($rowsFor($c) * self::ROW_H <= $areaH) { $columns = $c; break; }
            }
            if ($columns === null) { $columns = min($maxColumns, $questionCount); $fits = false; }
        }
        $tablesW = $columns * $tableW + ($columns - 1) * self::TABLE_GAP;
        $tablesLeft = $area['left'] + max(0, ($areaW - $tablesW) / 2);
        $answers = $this->answerGeometry($questionCount, $optionCount, $columns, $tablesLeft, $area['top'] + self::TITLE_H + self::TABLE_HEAD_H, $tableW, $W, $H, $settings['subject_blocks'] ?? []);
        if ($answers['bottom_mm'] > $bottomLimit + 0.01) $fits = false;
        unset($answers['bottom_mm']);

        return [
            'version' => 2,                                         // the reader's contract (page-normalized rects) is unchanged; page_mm marks the mm layout
            'coordinate_space' => 'omr-page-normalized',
            'bubble_only' => true,
            'page_mm' => [$W, $H],
            'fits' => $fits,
            'markers' => ['left' => $markerX[0] / $W, 'right' => $markerX[1] / $W, 'top' => $markerY[0] / $H, 'bottom' => $markerY[1] / $H],
            'code' => $this->bounds($codeBits) + ['bits' => $codeBits, 'value' => $code],
            'heading' => $heading,
            'notes' => $notes,
            ...($manual ? ['panel' => $panel] : []),
            'answers_title' => $n($tablesLeft, $area['top'], $tablesW, self::TITLE_H),
            ...$grids,
            'answers' => $answers,
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

    /** D128: a grouped paper gets one heading slot (a row's height) before each subject block; question rows keep their index */
    private function answerGeometry(int $questionCount, int $optionCount, int $columnCount, float $leftMm, float $topMm, float $tableW, float $W, float $H, array $subjectBlocks = []): array
    {
        $starts = array_column($subjectBlocks, 'name', 'start');
        $slots = [];
        foreach (range(0, $questionCount - 1) as $q) {
            if (array_key_exists($q, $starts)) $slots[] = ['heading' => (string) $starts[$q]];
            $slots[] = ['question' => $q];
        }
        $perColumn = (int) ceil(count($slots) / $columnCount);
        $groups = array_chunk($slots, max(1, $perColumn));
        for ($g = 0; $g < count($groups) - 1; $g++) {             // a heading never ends a column: it moves to the top of the next one
            if (isset(end($groups[$g])['heading'])) array_unshift($groups[$g + 1], array_pop($groups[$g]));
        }
        $n = fn (float $l, float $t, float $w, float $h): array => $this->rect($l / $W, $t / $H, $w / $W, $h / $H);
        $columns = [];
        $rowsMax = 0;
        foreach ($groups as $columnIndex => $group) {
            $columnLeft = $leftMm + $columnIndex * ($tableW + self::TABLE_GAP);
            $bubbleLeft = $columnLeft + self::NUMBER_W;
            $columnRows = [];
            $headings = [];
            foreach ($group as $rowIndex => $slot) {
                $rowTop = $topMm + $rowIndex * self::ROW_H;
                if (isset($slot['heading'])) { $headings[] = ['label' => $slot['heading'], 'rect' => $n($columnLeft, $rowTop, $tableW, self::ROW_H)]; continue; }
                $cells = [];
                for ($o = 0; $o < $optionCount; $o++) {
                    $cell = [$bubbleLeft + $o * self::OPTION_W, $rowTop, self::OPTION_W, self::ROW_H];
                    $cells[] = ['cell' => $n(...$cell), 'bubble' => $this->bubbleIn($cell, $W, $H)];
                }
                $columnRows[] = ['question_index' => $slot['question'], 'number' => $n($columnLeft, $rowTop, self::NUMBER_W, self::ROW_H), 'options' => $cells];
            }
            $rowsMax = max($rowsMax, count($group));
            $bounds = $n($bubbleLeft, $topMm, self::OPTION_W * $optionCount, count($group) * self::ROW_H);
            $columns[] = $bounds + ['bubbles' => $bounds, 'rows' => $columnRows] + ($headings ? ['headings' => $headings] : []);
        }
        $first = $columns[0];
        $last = $columns[array_key_last($columns)];
        return [
            'left' => $first['left'],
            'top' => $topMm / $H,
            'width' => ($last['left'] + $last['width']) - $first['left'],
            'height' => $rowsMax * self::ROW_H / $H,
            'column_count' => count($columns),
            'columns' => $columns,
            'bottom_mm' => $topMm + $rowsMax * self::ROW_H,
        ];
    }

    private function numericGrid(float $leftMm, float $topMm, int $digitCount, float $W, float $H): array
    {
        $rows = [];
        $cells = [];
        for ($digit = 0; $digit < 10; $digit++) {
            $row = [];
            for ($column = 0; $column < $digitCount; $column++) {
                $mm = [$leftMm + $column * self::DIGIT_W, $topMm + $digit * self::DIGIT_H, self::DIGIT_W, self::DIGIT_H];
                $cell = $this->rect($mm[0] / $W, $mm[1] / $H, $mm[2] / $W, $mm[3] / $H);
                $row[] = ['cell' => $cell, 'bubble' => $this->bubbleIn($mm, $W, $H)];
                $cells[] = $cell;
            }
            $rows[] = $row;
        }
        return $this->bounds($cells) + ['digit_count' => $digitCount, 'column_count' => $digitCount, 'rows' => $rows];
    }

    /** a 5 mm bubble centred in a cell given in mm, normalized to the page */
    private function bubbleIn(array $mm, float $W, float $H): array
    {
        [$l, $t, $w, $h] = $mm;
        $d = min(self::BUBBLE, $w, $h);
        return $this->rect(($l + ($w - $d) / 2) / $W, ($t + ($h - $d) / 2) / $H, $d / $W, $d / $H);
    }

    private function rect(float $left, float $top, float $width, float $height): array
    {
        return compact('left', 'top', 'width', 'height');
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

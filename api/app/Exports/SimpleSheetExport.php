<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\{FromArray, WithHeadings, WithTitle};

// One sheet from rows + headings (import error report, template sheets)
class SimpleSheetExport implements FromArray, WithHeadings, WithTitle
{
    public function __construct(private array $headings, private array $rows, private string $title = 'Sheet1') {}

    public function array(): array { return $this->rows; }
    public function headings(): array { return $this->headings; }
    public function title(): string { return $this->title; }
}

<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\{FromArray, WithCustomValueBinder, WithHeadings};
use PhpOffice\PhpSpreadsheet\Cell\StringValueBinder;

class ExpenseSheetExport extends StringValueBinder implements FromArray, WithHeadings, WithCustomValueBinder
{
    public function __construct(private array $columns, private array $rows) {}
    public function array(): array { return $this->rows; }
    public function headings(): array { return $this->columns; }
}

<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\{FromArray, WithCustomValueBinder, WithHeadings, WithEvents};
use Maatwebsite\Excel\Events\AfterSheet;
use PhpOffice\PhpSpreadsheet\Cell\StringValueBinder;

class CashBookSheetExport extends StringValueBinder implements FromArray, WithHeadings, WithCustomValueBinder, WithEvents
{
    public function __construct(private array $columns, private array $rows) {}
    public function array(): array { return $this->rows; }
    public function headings(): array { return $this->columns; }
    public function registerEvents(): array
    {
        return [AfterSheet::class => fn (AfterSheet $event) => $event->sheet->getDelegate()->setRightToLeft(app()->getLocale() === 'ar')];
    }
}

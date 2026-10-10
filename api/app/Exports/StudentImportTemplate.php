<?php

namespace App\Exports;

use App\Imports\StudentRowImporter;
use App\Models\Batch;
use Maatwebsite\Excel\Concerns\WithMultipleSheets;

// GET /imports/templates/students.xlsx (student-import.md "Template Sheets"): Students (headers + one example), the institution's
// batch list (what the `batch` column may contain), and the instructions - in the request's language
class StudentImportTemplate implements WithMultipleSheets
{
    public function sheets(): array
    {
        $batches = Batch::with('program:id,name')->whereIn('status', ['upcoming', 'running'])->orderBy('program_id')->orderBy('name')->get()
            ->map(fn ($b) => [$b->id, $b->program ? "{$b->program->name} - {$b->name}" : $b->name])->all();
        $example = ['Rahim Uddin', '01711111111', $batches[0][1] ?? '', '', '1', 'male', '2014-05-15', 'Abdul Karim', 'Fatema Begum', 'Dhaka', date('Y-m-d'), ''];
        return [
            new SimpleSheetExport(StudentRowImporter::FIELDS, [$example], 'Students'),
            new SimpleSheetExport(['batch_id', 'batch'], $batches, term('batches')),
            new SimpleSheetExport([__('imports.instructions_title')], array_map(fn ($l) => [$l], __('imports.instructions')), 'Instructions'),
        ];
    }
}

<?php

namespace App\Imports;

use App\Models\FeeStructure;
use Illuminate\Support\Facades\Validator;

// D193 MIG.1 kind=fee_structure: a fee amount for a class (and optionally one batch) and fee head. Natural key (program, batch,
// fee head, year 0) - the academic-year link is not imported (DECISIONS 2026-11-07 MIG.1). Configuration, not money paid: undo
// removes the row.
final class FeeStructureRowImporter extends RowImporter
{
    public function __construct(private Lookup $find) {}

    public function fields(): array { return ['program', 'batch', 'fee_category', 'amount']; }
    public function required(): array { return ['program', 'fee_category', 'amount']; }
    public function aliases(): array { return ['class' => 'program', 'course' => 'program', 'section' => 'batch', 'category' => 'fee_category', 'fee' => 'fee_category', 'fee_head' => 'fee_category'] ; }

    public function check(array $data): array
    {
        $v = Validator::make($data, ['program' => 'required|string', 'batch' => 'nullable|string', 'fee_category' => 'required|string',
            'amount' => ['required', 'regex:/^\d{1,8}(\.\d{1,2})?$/']]);
        if ($v->fails()) return $this->result('error', $v->errors()->first(), $data);
        $program = $this->find->program($data['program']);
        if (!$program) return $this->result('error', __('errors.import_unknown', ['field' => 'program', 'value' => $data['program']]), $data);
        $batch = !empty($data['batch']) ? $this->find->batch($program, $data['batch']) : null;
        if (!empty($data['batch']) && !$batch) return $this->result('error', __('errors.import_unknown', ['field' => 'batch', 'value' => $data['batch']]), $data);
        $cat = $this->find->category($data['fee_category']);
        if (!$cat) return $this->result('error', __('errors.import_unknown', ['field' => 'fee_category', 'value' => $data['fee_category']]), $data);
        $key = ['program_id' => $program->id, 'batch_id' => $batch?->id ?? 0, 'fee_category_id' => $cat->id, 'academic_year_id' => 0];
        if ($dup = $this->duplicate(implode('|', $key), $data)) return $dup;
        if (FeeStructure::where($key)->exists()) return $this->result('skipped', __('errors.import_exists'), $data);
        return $this->result('ok', null, $data + ['_key' => $key]);
    }

    public function create(array $data): array
    {
        return ['fee_structures', FeeStructure::create($data['_key'] + ['amount' => $data['amount']])->id];
    }

    public function undo(string $table, int $id): ?string
    {
        FeeStructure::whereKey($id)->delete();
        return null;
    }
}

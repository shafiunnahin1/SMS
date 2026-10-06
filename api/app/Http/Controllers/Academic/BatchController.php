<?php

namespace App\Http\Controllers\Academic;

use App\Http\Controllers\Controller;
use App\Models\Batch;

// Step 4.1 routes; the walking-skeleton slice builds index only (the admission form's batch list). CRUD follows in 4.1.
class BatchController extends Controller
{
    public function index()
    {
        $batches = Batch::with('program:id,name')->whereIn('status', ['upcoming', 'running'])->orderBy('program_id')->orderBy('name')->get()
            ->map(fn ($b) => ['id' => $b->id, 'name' => $b->name, 'program' => $b->program ? ['id' => $b->program->id, 'name' => $b->program->name] : null,
                'monthly_fee' => $b->monthly_fee, 'max_capacity' => $b->max_capacity]);

        return response()->json(['success' => true, 'data' => $batches]);
    }
}

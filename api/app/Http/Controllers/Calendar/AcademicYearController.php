<?php

namespace App\Http\Controllers\Calendar;

use App\Http\Controllers\Controller;
use App\Models\{AcademicYear, AuditLog};
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{Cache, DB};
use Illuminate\Validation\Rule;

// D213 CAL.1 (docs/modules/academic-calendar.md): the admin lists and creates academic years and sets the current one
// (exactly one; the `academic_year` middleware cache is cleared).
class AcademicYearController extends Controller
{
    public function index()
    {
        return response()->json(['success' => true, 'data' => AcademicYear::orderByDesc('start_date')->get()->map(fn ($y) => $this->row($y))->values()]);
    }

    /** POST /academic-years (name, start_date, end_date) */
    public function store(Request $request)
    {
        $d = $request->validate([
            'name' => ['required', 'string', 'max:20', Rule::unique('academic_years', 'name')->where('institution_id', Tenancy::current()->id)],
            'start_date' => 'required|date_format:Y-m-d', 'end_date' => 'required|date_format:Y-m-d|after:start_date',
        ]);
        $y = AcademicYear::create($d + ['is_current' => false]);
        AuditLog::record('academic_year.created', $y);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($y->refresh())], 201);
    }

    /** PATCH /academic-years/{id}/set-current */
    public function setCurrent(int $id)
    {
        $y = AcademicYear::findOrFail($id);
        DB::transaction(function () use ($y) {
            AcademicYear::where('is_current', true)->whereKeyNot($y->id)->get()->each->update(['is_current' => false]);
            $y->update(['is_current' => true]);
        });
        Cache::forget('current_year:' . Tenancy::current()->id);
        AuditLog::record('academic_year.set_current', $y);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($y)]);
    }

    private function row(AcademicYear $y): array
    {
        return ['id' => $y->id, 'name' => $y->name, 'start_date' => $y->start_date->toDateString(), 'end_date' => $y->end_date->toDateString(), 'is_current' => (bool) $y->is_current];
    }
}

<?php

namespace App\Http\Controllers\Calendar;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Holiday};
use App\Services\Calendar\HolidayService;
use Illuminate\Http\Request;

// D213 CAL.1: the admin lists (by month or year), adds (one day or a range), edits and deletes holidays;
// GET /holidays/calendar gives a whole year's holidays to every signed-in role of the module.
class HolidayController extends Controller
{
    public function __construct(private HolidayService $holidays) {}

    /** GET /holidays?month=YYYY-MM | ?year=YYYY */
    public function index(Request $request)
    {
        $f = $request->validate(['month' => 'nullable|date_format:Y-m', 'year' => 'nullable|integer|between:2000,2100']);
        $q = Holiday::query()->orderBy('date');
        if (!empty($f['month'])) $q->where('date', 'like', $f['month'] . '-%');
        else $q->whereYear('date', $f['year'] ?? now()->year);
        return response()->json(['success' => true, 'data' => $q->get()->map(fn ($h) => $this->row($h))->values()]);
    }

    /** GET /holidays/calendar?year=YYYY */
    public function calendar(Request $request)
    {
        $f = $request->validate(['year' => 'nullable|integer|between:2000,2100']);
        $rows = Holiday::whereYear('date', $f['year'] ?? now()->year)->orderBy('date')->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($h) => ['date' => $h->date->toDateString(), 'title' => $h->title, 'type' => $h->type])->values()]);
    }

    /** POST /holidays (title, date, end_date?, type?, description?) */
    public function store(Request $request)
    {
        $d = $request->validate($this->rules() + ['end_date' => 'nullable|date_format:Y-m-d|after_or_equal:date']);
        $rows = $this->holidays->create($d);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => array_map(fn ($h) => $this->row($h), $rows)], 201);
    }

    /** PUT /holidays/{id} */
    public function update(Request $request, int $id)
    {
        $h = Holiday::findOrFail($id);
        $d = $request->validate($this->rules());
        if (Holiday::where('date', $d['date'])->whereKeyNot($h->id)->exists()) throw new BusinessException('a holiday already exists on this day', 'holiday_exists', 422);
        $h->update(['title' => $d['title'], 'date' => $d['date'], 'type' => $d['type'] ?? $h->type, 'description' => $d['description'] ?? null]);
        AuditLog::record('holiday.updated', $h);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($h)]);
    }

    public function destroy(int $id)
    {
        $h = Holiday::findOrFail($id);
        $h->delete();
        AuditLog::record('holiday.deleted', $h);
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    private function rules(): array
    {
        return ['title' => 'required|string|max:150', 'date' => 'required|date_format:Y-m-d', 'type' => 'nullable|in:public,institution,optional', 'description' => 'nullable|string|max:255'];
    }

    private function row(Holiday $h): array
    {
        return ['id' => $h->id, 'title' => $h->title, 'date' => $h->date->toDateString(), 'type' => $h->type, 'description' => $h->description];
    }
}

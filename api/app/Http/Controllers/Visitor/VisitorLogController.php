<?php

namespace App\Http\Controllers\Visitor;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, VisitorLog};
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

// D240 VIS.1 (extended-features.md section 8): the admin and staff with staff.visitor.manage check visitors in and out (staff.visitor.read
// to see); the admin corrects an entry the same day, audited by fields (never the phone or ID number); never deleted. Personal data:
// the photo is on the private disk behind a short signed link and is deleted 90 days after the visit (visitors:purge-photos).
class VisitorLogController extends Controller
{
    public const PHOTO_DAYS = 90;
    private const PRIVATE_FIELDS = ['visitor_phone', 'id_number', 'photo'];

    /** GET /visitors?date=&q= - one day (today by default): inside now and left */
    public function index(Request $request)
    {
        $f = $request->validate(['date' => 'nullable|date_format:Y-m-d', 'q' => 'nullable|string|max:100']);
        $day = Carbon::parse($f['date'] ?? today()->toDateString());
        $rows = VisitorLog::with('creator:id,name')->whereBetween('check_in', [$day->copy()->startOfDay(), $day->copy()->endOfDay()])
            ->when(trim($f['q'] ?? '') !== '', fn ($q) => $q->where(fn ($w) => $w->where('visitor_name', 'like', '%' . trim($f['q']) . '%')->orWhere('visitor_phone', 'like', '%' . trim($f['q']) . '%')))
            ->orderByDesc('check_in')->orderByDesc('id')->limit(500)->get();
        return response()->json(['success' => true, 'data' => ['date' => $day->toDateString(),
            'inside' => $rows->whereNull('check_out')->map(fn ($v) => self::row($v))->values(), 'left' => $rows->whereNotNull('check_out')->map(fn ($v) => self::row($v))->values()]]);
    }

    /** POST /visitors/check-in (multipart; photo optional) */
    public function checkIn(Request $request)
    {
        $f = $request->validate($this->fields(true) + ['photo' => 'nullable|image|mimes:jpeg,png,webp|max:2048']);
        unset($f['photo']);
        $v = VisitorLog::create($f + ['check_in' => now(), 'created_by' => $request->user()->id]);
        if ($request->hasFile('photo')) {
            $file = $request->file('photo');
            $v->forceFill(['photo' => $file->storeAs("institutions/{$v->institution_id}/visitors", 'visitor-' . $v->id . '-' . Str::uuid() . '.' . $file->extension(), 'private')])->save();
        }
        AuditLog::record('visitor.checked_in', $v);
        return response()->json(['success' => true, 'message' => __('visitor.checked_in'), 'data' => self::row($v->fresh('creator:id,name'))], 201);
    }

    /** PATCH /visitors/{id}/check-out - once */
    public function checkOut(Request $request, int $id)
    {
        $v = VisitorLog::findOrFail($id);
        if ($v->check_out) throw ValidationException::withMessages(['check_out' => __('visitor.already_out')]);
        $v->update(['check_out' => now()]);
        AuditLog::record('visitor.checked_out', $v);
        return response()->json(['success' => true, 'message' => __('visitor.checked_out'), 'data' => self::row($v->fresh('creator:id,name'))]);
    }

    /** PUT /visitors/{id} - the admin, the same day only; the audit keeps which fields changed and the old non-private values */
    public function update(Request $request, int $id)
    {
        $v = VisitorLog::findOrFail($id);
        if (!$v->check_in->isSameDay(now())) throw ValidationException::withMessages(['check_in' => __('visitor.same_day_only')]);
        $f = $request->validate($this->fields(false));
        $changed = array_keys(array_filter($f, fn ($val, $k) => (string) $v->{$k} !== (string) $val, ARRAY_FILTER_USE_BOTH));
        $was = collect($v->only($changed))->except(self::PRIVATE_FIELDS)->all();
        $v->update($f);
        AuditLog::record('visitor.corrected', $v, ['fields' => $changed, 'was' => $was]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($v->fresh('creator:id,name'))]);
    }

    /** GET /visitors/report?from=&to= - at most 92 days; counts per day and per purpose */
    public function report(Request $request)
    {
        $f = $request->validate(['from' => 'required|date_format:Y-m-d', 'to' => 'required|date_format:Y-m-d|after_or_equal:from']);
        $from = Carbon::parse($f['from'])->startOfDay();
        $to = Carbon::parse($f['to'])->endOfDay();
        if ($from->diffInDays($to) > 92) throw ValidationException::withMessages(['to' => __('visitor.range_too_long')]);
        $rows = VisitorLog::with('creator:id,name')->whereBetween('check_in', [$from, $to])->orderBy('check_in')->orderBy('id')->limit(5000)->get();
        return response()->json(['success' => true, 'data' => ['from' => $f['from'], 'to' => $f['to'], 'total' => $rows->count(),
            'per_day' => $rows->groupBy(fn ($v) => $v->check_in->toDateString())->map->count(),
            'per_purpose' => $rows->groupBy(fn ($v) => mb_strtolower(trim($v->purpose)))->map->count()->sortDesc(),
            'entries' => $rows->map(fn ($v) => self::row($v, false))->values()]]);
    }

    // ---- helpers ----

    private function fields(bool $create): array
    {
        $r = $create ? 'required' : 'sometimes';
        return ['visitor_name' => [$r, 'string', 'max:100'], 'purpose' => [$r, 'string', 'max:150'], 'visitor_phone' => 'nullable|string|max:20',
            'whom_to_meet' => 'nullable|string|max:100', 'department' => 'nullable|string|max:100', 'id_type' => 'nullable|in:nid,passport,driving_license,other',
            'id_number' => 'nullable|string|max:50', 'badge_no' => 'nullable|string|max:20'];
    }

    public static function row(VisitorLog $v, bool $photo = true): array
    {
        return ['id' => $v->id, 'visitor_name' => $v->visitor_name, 'visitor_phone' => $v->visitor_phone, 'purpose' => $v->purpose, 'whom_to_meet' => $v->whom_to_meet,
            'department' => $v->department, 'id_type' => $v->id_type, 'id_number' => $v->id_number, 'badge_no' => $v->badge_no,
            'check_in' => $v->check_in?->toIso8601String(), 'check_out' => $v->check_out?->toIso8601String(), 'written_by' => $v->creator?->name,
            'has_photo' => (bool) $v->photo, 'photo_url' => $photo && $v->photo ? Storage::disk('private')->temporaryUrl($v->photo, now()->addMinutes(10)) : null];
    }
}

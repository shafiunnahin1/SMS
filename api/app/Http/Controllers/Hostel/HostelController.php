<?php

namespace App\Http\Controllers\Hostel;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Hostel, HostelAllocation, HostelRoom, Student};
use App\Services\Hostel\HostelService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// D233 HST.1: hostels (read: staff.hostel.read; changes: staff.hostel.manage), the occupancy report, and the student's / parent's
// own view. A hostel any of whose rooms was ever allocated is not removed.
class HostelController extends Controller
{
    public function __construct(private HostelService $hostels) {}

    /** GET /hostel?type= */
    public function index(Request $request)
    {
        $f = $request->validate(['type' => 'nullable|in:boys,girls']);
        $rows = Hostel::withSum('rooms as seats', 'capacity')->withSum('rooms as occupied', 'current_occupancy')
            ->when($f['type'] ?? null, fn ($q, $t) => $q->where('type', $t))->orderBy('name')->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($h) => self::row($h))->values()]);
    }

    /** POST /hostel */
    public function store(Request $request)
    {
        $h = Hostel::create($this->validated($request, true) + ['total_rooms' => 0]);
        AuditLog::record('hostel.created', $h);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($h)], 201);
    }

    /** PUT /hostel/{id} - the type does not change while anyone lives there */
    public function update(Request $request, int $id)
    {
        $h = Hostel::findOrFail($id);
        $f = $this->validated($request, false);
        if (isset($f['type']) && $f['type'] !== $h->type && HostelAllocation::active()->whereIn('room_id', HostelRoom::where('hostel_id', $h->id)->select('id'))->exists()) {
            throw \Illuminate\Validation\ValidationException::withMessages(['type' => __('hostel.type_in_use')]);
        }
        $h->update($f);
        AuditLog::record('hostel.updated', $h);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($h->fresh())]);
    }

    /** DELETE /hostel/{id} - only if no room of it was ever allocated */
    public function destroy(int $id)
    {
        $h = Hostel::findOrFail($id);
        if (HostelAllocation::whereIn('room_id', HostelRoom::where('hostel_id', $h->id)->select('id'))->exists()) throw new BusinessException(__('hostel.hostel_used'), 'hostel_in_use', 409);
        DB::transaction(function () use ($h) {
            HostelRoom::where('hostel_id', $h->id)->delete();
            AuditLog::record('hostel.removed', $h);
            $h->delete();
        });
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** GET /hostel/reports/occupancy - seats, occupied and free per hostel */
    public function occupancy()
    {
        $rows = Hostel::withCount('rooms')->withSum('rooms as seats', 'capacity')->withSum('rooms as occupied', 'current_occupancy')->orderBy('name')->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($h) => ['id' => $h->id, 'name' => $h->name, 'type' => $h->type, 'rooms' => (int) $h->rooms_count,
            'seats' => (int) ($h->seats ?? 0), 'occupied' => (int) ($h->occupied ?? 0), 'free' => max(0, (int) ($h->seats ?? 0) - (int) ($h->occupied ?? 0))])->values()]);
    }

    /** GET /student/hostel */
    public function mine(Request $request)
    {
        return response()->json(['success' => true, 'data' => $this->hostels->forStudent(Student::where('user_id', $request->user()->id)->firstOrFail())]);
    }

    /** GET /parent/children/{id}/hostel */
    public function child(Request $request, int $id)
    {
        $s = Student::whereKey($id)->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail();
        return response()->json(['success' => true, 'data' => $this->hostels->forStudent($s)]);
    }

    private function validated(Request $request, bool $create): array
    {
        $r = $create ? 'required' : 'sometimes';
        return $request->validate(['name' => [$r, 'string', 'max:100'], 'type' => [$r, 'in:boys,girls'], 'warden_name' => 'nullable|string|max:100',
            'warden_phone' => ['nullable', 'string', 'max:20', 'regex:/^\+?[0-9 -]{6,20}$/'], 'total_rooms' => 'prohibited']);
    }

    public static function row(Hostel $h): array
    {
        return ['id' => $h->id, 'name' => $h->name, 'type' => $h->type, 'total_rooms' => (int) $h->total_rooms, 'warden_name' => $h->warden_name, 'warden_phone' => $h->warden_phone,
            'seats' => (int) ($h->seats ?? 0), 'occupied' => (int) ($h->occupied ?? 0)];
    }
}

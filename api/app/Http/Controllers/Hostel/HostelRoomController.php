<?php

namespace App\Http\Controllers\Hostel;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Hostel, HostelAllocation, HostelRoom};
use App\Services\Hostel\HostelService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

// D233 HST.1: rooms of a hostel and the free rooms. Seats never below the room's occupants; a room ever allocated is not removed;
// the hostel's total_rooms follows the room count.
class HostelRoomController extends Controller
{
    public function __construct(private HostelService $hostels) {}

    /** GET /hostel/{id}/rooms */
    public function index(int $id)
    {
        $h = Hostel::findOrFail($id);
        return response()->json(['success' => true, 'data' => HostelRoom::where('hostel_id', $h->id)->orderBy('floor')->orderBy('room_number')->get()->map(fn ($r) => self::row($r))->values()]);
    }

    /** POST /hostel/{id}/rooms */
    public function store(Request $request, int $id)
    {
        $h = Hostel::findOrFail($id);
        $f = $this->validated($request, true);
        if (HostelRoom::where('hostel_id', $h->id)->where('room_number', $f['room_number'])->exists()) throw ValidationException::withMessages(['room_number' => __('hostel.room_exists')]);
        $r = HostelRoom::create($f + ['hostel_id' => $h->id, 'current_occupancy' => 0]);
        $this->hostels->syncTotalRooms($h->id);
        AuditLog::record('hostel.room_added', $r);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($r->fresh())], 201);
    }

    /** PUT /hostel/{id}/rooms/{roomId} */
    public function update(Request $request, int $id, string $roomId)
    {
        $r = $this->room($id, $roomId);
        $f = $this->validated($request, false);
        if (isset($f['capacity']) && (int) $f['capacity'] < $this->hostels->occupied($r->id)) throw ValidationException::withMessages(['capacity' => __('hostel.capacity_below', ['n' => $this->hostels->occupied($r->id)])]);
        if (isset($f['room_number']) && HostelRoom::where('hostel_id', $r->hostel_id)->where('room_number', $f['room_number'])->whereKeyNot($r->id)->exists()) throw ValidationException::withMessages(['room_number' => __('hostel.room_exists')]);
        $r->update($f);
        AuditLog::record('hostel.room_updated', $r);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($r->fresh())]);
    }

    /** DELETE /hostel/{id}/rooms/{roomId} - only a room never allocated */
    public function destroy(int $id, string $roomId)
    {
        $r = $this->room($id, $roomId);
        if (HostelAllocation::where('room_id', $r->id)->exists()) throw new BusinessException(__('hostel.room_used'), 'room_in_use', 409);
        AuditLog::record('hostel.room_removed', $r);
        $r->delete();
        $this->hostels->syncTotalRooms($id);
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** GET /hostel/available-rooms?hostel_id=&floor= */
    public function available(Request $request)
    {
        $f = $request->validate(['hostel_id' => 'nullable|integer', 'floor' => 'nullable|integer']);
        $rows = HostelRoom::with('hostel:id,name,type')->whereColumn('current_occupancy', '<', 'capacity')
            ->when($f['hostel_id'] ?? null, fn ($q, $v) => $q->where('hostel_id', $v))->when(isset($f['floor']), fn ($q) => $q->where('floor', $f['floor']))
            ->orderBy('hostel_id')->orderBy('floor')->orderBy('room_number')->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($r) => self::row($r) + ['hostel' => ['id' => $r->hostel_id, 'name' => $r->hostel?->name, 'type' => $r->hostel?->type]])->values()]);
    }

    /** the room of this hostel; another hostel's or institution's room is 404 (the id is checked here: a route pattern answers 404 before the role check) */
    private function room(int $hostelId, string $roomId): HostelRoom
    {
        abort_unless(ctype_digit($roomId), 404);
        return HostelRoom::where('hostel_id', Hostel::findOrFail($hostelId)->id)->findOrFail((int) $roomId);
    }

    private function validated(Request $request, bool $create): array
    {
        $r = $create ? 'required' : 'sometimes';
        return $request->validate(['room_number' => [$r, 'string', 'max:20'], 'capacity' => [$r, 'integer', 'min:1', 'max:50'], 'floor' => 'nullable|integer|min:0|max:100',
            'monthly_fee' => ['nullable', 'regex:/^\d{1,6}(\.\d{1,2})?$/'], 'current_occupancy' => 'prohibited']);
    }

    public static function row(HostelRoom $r): array
    {
        return ['id' => $r->id, 'hostel_id' => $r->hostel_id, 'room_number' => $r->room_number, 'floor' => (int) ($r->floor ?? 1), 'capacity' => (int) $r->capacity,
            'occupied' => (int) $r->current_occupancy, 'monthly_fee' => $r->monthly_fee !== null ? (string) $r->monthly_fee : null];
    }
}

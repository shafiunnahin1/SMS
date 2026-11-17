<?php

namespace App\Http\Controllers\Transport;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, RouteStop, StudentTransport, TransportRoute, Vehicle};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// D229 TRN.1: routes with their stops and riders (read: staff.transport.read; changes: staff.transport.manage). A route with a
// riding student is not removed; a stop a student rides from is not removed.
class TransportRouteController extends Controller
{
    /** GET /transport/routes */
    public function index()
    {
        $routes = TransportRoute::with(['vehicle', 'stops'])->withCount(['assignments as riders' => fn ($q) => $q->whereNull('ended_on')])->orderBy('name')->get();
        return response()->json(['success' => true, 'data' => $routes->map(fn ($r) => self::row($r))->values()]);
    }

    /** POST /transport/routes */
    public function store(Request $request)
    {
        $r = TransportRoute::create($this->validated($request, true));
        AuditLog::record('transport.route_added', $r);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($r->load(['vehicle', 'stops'])->loadCount(['assignments as riders' => fn ($q) => $q->whereNull('ended_on')]))], 201);
    }

    /** PUT /transport/routes/{id} - a new fee applies to months not yet paid */
    public function update(Request $request, int $id)
    {
        $r = TransportRoute::findOrFail($id);
        $f = $this->validated($request, false);
        if (!empty($f['vehicle_id'])) {
            $riders = StudentTransport::where('route_id', $r->id)->active()->count();
            $cap = (int) Vehicle::whereKey($f['vehicle_id'])->value('capacity');
            if ($riders > $cap) throw \Illuminate\Validation\ValidationException::withMessages(['vehicle_id' => __('transport.capacity_below', ['n' => $riders])]);
        }
        $r->update($f);
        AuditLog::record('transport.route_updated', $r);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($r->fresh(['vehicle', 'stops'])->loadCount(['assignments as riders' => fn ($q) => $q->whereNull('ended_on')]))]);
    }

    /** DELETE /transport/routes/{id} - only a route nobody ever rode */
    public function destroy(int $id)
    {
        $r = TransportRoute::findOrFail($id);
        if (StudentTransport::where('route_id', $r->id)->exists()) throw new BusinessException(__('transport.route_in_use'), 'route_in_use', 409);
        DB::transaction(function () use ($r) {
            RouteStop::where('route_id', $r->id)->delete();
            AuditLog::record('transport.route_removed', $r);
            $r->delete();
        });
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** POST /transport/routes/{id}/stops */
    public function addStop(Request $request, int $id)
    {
        $r = TransportRoute::findOrFail($id);
        $f = $this->stopFields($request, true);
        $f['sequence'] ??= (int) RouteStop::where('route_id', $r->id)->max('sequence') + 1;
        $stop = RouteStop::create($f + ['route_id' => $r->id]);
        AuditLog::record('transport.stop_added', $stop);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::stop($stop)], 201);
    }

    /** PUT /transport/stops/{id} */
    public function updateStop(Request $request, int $id)
    {
        $stop = RouteStop::findOrFail($id);
        $stop->update($this->stopFields($request, false));
        AuditLog::record('transport.stop_updated', $stop);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::stop($stop->fresh())]);
    }

    /** DELETE /transport/stops/{id} - not while a student rides from it */
    public function destroyStop(int $id)
    {
        $stop = RouteStop::findOrFail($id);
        if (StudentTransport::where('stop_id', $stop->id)->exists()) throw new BusinessException(__('transport.stop_in_use'), 'stop_in_use', 409);
        AuditLog::record('transport.stop_removed', $stop);
        $stop->delete();
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** GET /transport/routes/{id}/students - the riders, in stop order */
    public function students(int $id)
    {
        $r = TransportRoute::findOrFail($id);
        $rows = StudentTransport::with(['student.user:id,name', 'stop'])->where('route_id', $r->id)->active()->get()
            ->sortBy(fn ($a) => [$a->stop?->sequence ?? PHP_INT_MAX, $a->id])->values();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($a) => ['id' => $a->id, 'student' => ['id' => $a->student_id, 'name' => $a->student?->user?->name, 'student_id' => $a->student?->student_id],
            'stop' => $a->stop ? ['id' => $a->stop->id, 'stop_name' => $a->stop->stop_name] : null, 'direction' => $a->direction, 'started_on' => $a->started_on->toDateString()])]);
    }

    private function validated(Request $request, bool $create): array
    {
        $f = $request->validate(['name' => [$create ? 'required' : 'sometimes', 'string', 'max:100'], 'vehicle_id' => 'nullable|integer',
            'morning_departure' => 'nullable|date_format:H:i', 'afternoon_departure' => 'nullable|date_format:H:i', 'monthly_fee' => ['nullable', 'regex:/^\d{1,6}(\.\d{1,2})?$/']]);
        if (!empty($f['vehicle_id'])) Vehicle::findOrFail($f['vehicle_id']);
        return $f;
    }

    private function stopFields(Request $request, bool $create): array
    {
        return $request->validate(['stop_name' => [$create ? 'required' : 'sometimes', 'string', 'max:100'], 'pickup_time' => 'nullable|date_format:H:i',
            'drop_time' => 'nullable|date_format:H:i', 'sequence' => 'sometimes|integer|min:1|max:1000']);
    }

    public static function stop(RouteStop $s): array
    {
        return ['id' => $s->id, 'stop_name' => $s->stop_name, 'pickup_time' => $s->pickup_time ? substr($s->pickup_time, 0, 5) : null, 'drop_time' => $s->drop_time ? substr($s->drop_time, 0, 5) : null, 'sequence' => $s->sequence];
    }

    public static function row(TransportRoute $r): array
    {
        return ['id' => $r->id, 'name' => $r->name, 'vehicle' => $r->vehicle ? TransportVehicleController::row($r->vehicle) : null,
            'morning_departure' => $r->morning_departure ? substr($r->morning_departure, 0, 5) : null, 'afternoon_departure' => $r->afternoon_departure ? substr($r->afternoon_departure, 0, 5) : null,
            'monthly_fee' => $r->monthly_fee !== null ? (string) $r->monthly_fee : null, 'riders' => (int) ($r->riders ?? 0),
            'stops' => $r->relationLoaded('stops') ? $r->stops->map(fn ($s) => self::stop($s))->values() : []];
    }
}

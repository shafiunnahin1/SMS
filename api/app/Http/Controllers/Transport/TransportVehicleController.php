<?php

namespace App\Http\Controllers\Transport;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, StudentTransport, TransportRoute, Vehicle};
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// D229 TRN.1: vehicles - the admin and staff with staff.transport.read see them; staff.transport.manage add, change and remove.
// A vehicle whose route has a riding student is not removed; capacity never below the riders of its routes.
class TransportVehicleController extends Controller
{
    /** GET /transport/vehicles */
    public function index()
    {
        return response()->json(['success' => true, 'data' => Vehicle::orderBy('name')->get()->map(fn ($v) => self::row($v))->values()]);
    }

    /** POST /transport/vehicles */
    public function store(Request $request)
    {
        $v = Vehicle::create($this->validated($request, true));
        AuditLog::record('transport.vehicle_added', $v);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($v)], 201);
    }

    /** PUT /transport/vehicles/{id} */
    public function update(Request $request, int $id)
    {
        $v = Vehicle::findOrFail($id);
        $f = $this->validated($request, false);
        if (isset($f['capacity'])) {
            $most = TransportRoute::where('vehicle_id', $v->id)->withCount(['assignments as riders' => fn ($q) => $q->whereNull('ended_on')])->get()->max('riders') ?? 0;
            if ((int) $f['capacity'] < $most) throw \Illuminate\Validation\ValidationException::withMessages(['capacity' => __('transport.capacity_below', ['n' => $most])]);
        }
        $v->update($f);
        AuditLog::record('transport.vehicle_updated', $v);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($v->fresh())]);
    }

    /** DELETE /transport/vehicles/{id} - not while one of its routes carries a student; its routes keep no vehicle */
    public function destroy(int $id)
    {
        $v = Vehicle::findOrFail($id);
        if (StudentTransport::active()->whereIn('route_id', TransportRoute::where('vehicle_id', $v->id)->select('id'))->exists()) throw new BusinessException(__('transport.vehicle_in_use'), 'vehicle_in_use', 409);
        if (TransportRoute::where('vehicle_id', $v->id)->exists()) throw new BusinessException(__('transport.vehicle_on_route'), 'vehicle_in_use', 409);
        AuditLog::record('transport.vehicle_removed', $v);
        $v->delete();
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    private function validated(Request $request, bool $create): array
    {
        $r = $create ? 'required' : 'sometimes';
        return $request->validate(['name' => [$r, 'string', 'max:100'], 'number_plate' => [$r, 'string', 'max:20'], 'capacity' => [$r, 'integer', 'min:1', 'max:200'],
            'driver_name' => 'nullable|string|max:100', 'driver_phone' => ['nullable', 'string', 'max:20', 'regex:/^\+?[0-9 -]{6,20}$/'], 'helper_name' => 'nullable|string|max:100',
            'status' => ['sometimes', Rule::in(['active', 'maintenance', 'inactive'])]]);
    }

    public static function row(Vehicle $v): array
    {
        return $v->only(['id', 'name', 'number_plate', 'capacity', 'driver_name', 'driver_phone', 'helper_name', 'status']);
    }
}

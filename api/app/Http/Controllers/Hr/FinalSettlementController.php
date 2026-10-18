<?php
namespace App\Http\Controllers\Hr;
use App\Http\Controllers\Controller;
use App\Http\Resources\PayrollResource;
use App\Services\Hr\PayrollRunService;
use Illuminate\Http\Request;

// R3.8 (staff-payroll.md §11): start the one-payee `final` run; review/approve/pay go through the normal run endpoints
class FinalSettlementController extends Controller
{
    public function start(Request $request, string $type, int $id, PayrollRunService $runs)
    {
        if (!in_array($type, ['teacher', 'staff'], true)) abort(404);
        return (new PayrollResource($runs->startFinal($request->user(), $type, $id, $request->all())))->additional(['success' => true])->response()->setStatusCode(201);
    }
}

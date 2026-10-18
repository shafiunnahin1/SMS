<?php
namespace App\Http\Controllers\Hr;
use App\Http\Controllers\Controller;
use App\Http\Resources\PayrollResource;
use App\Services\Hr\{PayrollPaymentService,PayslipService};
use Illuminate\Http\Request;

class PayrollItemController extends Controller
{
    /** PATCH /hr/payroll-items/{id} { action: hold|release|returned, reason } */
    public function update(Request $request, int $id, PayrollPaymentService $payments)
    {
        $input = $request->all();
        $item = ($input['action'] ?? null) === 'returned'
            ? $payments->fail($request->user(), $id, array_diff_key($input, ['action' => true]))
            : $payments->hold($request->user(), $id, $input);
        return (new PayrollResource($item))->additional(['success' => true]);
    }

    public function slip(Request $request, int $id, PayslipService $slips)
    {
        return response($slips->render($request->user(), $id), 200, ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="payslip-'.$id.'.pdf"']);
    }
}

<?php
namespace App\Http\Controllers\Hr;
use App\Http\Controllers\Controller;
use App\Http\Resources\{PayrollResource,SalaryResource};
use App\Models\{PayrollItem,PayrollRun,SalaryStructure,Teacher};
use App\Services\Hr\{PayslipService,SalaryAccess};
use App\Support\Money;
use Illuminate\Http\Request;

// staff-payroll.md §12: a teacher sees only their own slips, structure history and YTD; nothing about other payees
class TeacherSalaryController extends Controller
{
    private function own(Request $request, SalaryAccess $access): Teacher
    {
        $actor = $access->actor($request->user(), true);
        $teacher = Teacher::where('user_id', $actor->id)->firstOrFail();
        $access->payee($actor, 'teacher', (int) $teacher->id, true);
        return $teacher;
    }

    private function items(Teacher $teacher)
    {
        return PayrollItem::where('payee_type', 'teacher')->where('payee_id', $teacher->id)
            ->whereIn('run_id', PayrollRun::whereIn('status', ['approved', 'paid'])->select('id'));
    }

    public function summary(Request $request, SalaryAccess $access)
    {
        $teacher = $this->own($request, $access);
        $year = now()->format('Y');
        $ytd = $this->items($teacher)->whereIn('run_id', PayrollRun::where('month', 'like', $year.'-%')->select('id'))->get();
        $latest = $this->items($teacher)->orderByDesc('id')->first();
        return response()->json(['success' => true, 'data' => ['year' => (int) $year,
            'ytd_earnings' => Money::format($ytd->sum(fn ($i) => Money::toPaisa((string) $i->total_earnings))),
            'ytd_net' => Money::format($ytd->sum(fn ($i) => Money::toPaisa((string) $i->net))),
            'latest' => $latest ? (new PayrollResource($latest))->toArray($request) : null]]);
    }

    public function slips(Request $request, SalaryAccess $access)
    {
        $teacher = $this->own($request, $access);
        return PayrollResource::collection($this->items($teacher)->orderByDesc('id')->paginate($request->integer('per_page', 25)))->additional(['success' => true]);
    }

    public function slip(Request $request, int $id, PayslipService $slips)
    {
        return response($slips->render($request->user(), $id, true), 200, ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="payslip-'.$id.'.pdf"']);
    }

    public function history(Request $request, SalaryAccess $access)
    {
        $teacher = $this->own($request, $access);
        return SalaryResource::collection(SalaryStructure::where('payee_type', 'teacher')->where('payee_id', $teacher->id)->orderByDesc('effective_from')->get())->additional(['success' => true]);
    }
}

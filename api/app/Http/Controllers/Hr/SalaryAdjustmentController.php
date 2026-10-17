<?php
namespace App\Http\Controllers\Hr;
use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Hr\{SalaryQueryRequest,SalaryWriteRequest};
use App\Http\Resources\SalaryResource;
use App\Models\SalaryAdjustment;
use App\Services\Hr\{SalaryAccess,SalaryAdjustmentService};
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
class SalaryAdjustmentController extends Controller
{
    public function index(SalaryQueryRequest $request,SalaryAccess $access)
    {
        $access->actor($request->user());
        $rows=SalaryAdjustment::query()->when($request->filled('status'),fn($q)=>$q->where('status',$request->input('status')))
            ->when($request->filled('payee_type'),fn($q)=>$q->where('payee_type',$request->input('payee_type')))
            ->when($request->filled('payee_id'),fn($q)=>$q->where('payee_id',$request->integer('payee_id')))
            ->orderByDesc('id')->paginate($request->integer('per_page',25));
        return SalaryResource::collection($rows)->additional(['success'=>true]);
    }

    public function store(SalaryWriteRequest $request,SalaryAdjustmentService $service)
    {
        return (new SalaryResource($service->store($request->user(),$request->all())))->additional(['success'=>true])->response()->setStatusCode(201);
    }

    public function suggestExtraClass(SalaryQueryRequest $request,SalaryAccess $access)
    {
        $access->actor($request->user());
        throw new BusinessException(__('salary.conflict'),'dependency_pending',409);
    }

    public function approve(SalaryWriteRequest $request,int $id,SalaryAdjustmentService $service)
    {
        $this->assertEmpty($request);
        return (new SalaryResource($service->transition($request->user(),$id,'approve')))->additional(['success'=>true]);
    }

    public function cancel(SalaryWriteRequest $request,int $id,SalaryAdjustmentService $service)
    {
        $this->assertEmpty($request);
        return (new SalaryResource($service->transition($request->user(),$id,'cancel')))->additional(['success'=>true]);
    }

    private function assertEmpty(Request $request): void
    {
        if($request->all()) throw ValidationException::withMessages(['adjustment'=>__('salary.invalid')]);
    }
}
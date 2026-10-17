<?php
namespace App\Http\Controllers\Hr;
use App\Http\Controllers\Controller;
use App\Http\Requests\Hr\{SalaryQueryRequest,SalaryWriteRequest};
use App\Http\Resources\SalaryResource;
use App\Models\{SalaryAdvance,Teacher};
use App\Services\Hr\{SalaryAccess,SalaryAdvanceService};
use App\Services\DepartmentRequestContextService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
class SalaryAdvanceController extends Controller
{
    public function index(SalaryQueryRequest $request,SalaryAccess $access)
    {
        $access->actor($request->user());
        $rows=SalaryAdvance::query()->when($request->filled('status'),fn($q)=>$q->where('status',$request->input('status')))
            ->when($request->filled('payee_type'),fn($q)=>$q->where('payee_type',$request->input('payee_type')))
            ->when($request->filled('payee_id'),fn($q)=>$q->where('payee_id',$request->integer('payee_id')))
            ->orderByDesc('id')->paginate($request->integer('per_page',25));
        return SalaryResource::collection($rows)->additional(['success'=>true]);
    }

    public function store(SalaryWriteRequest $request,SalaryAdvanceService $service)
    {
        return (new SalaryResource($service->store($request->user(),$request->all())))->additional(['success'=>true])->response()->setStatusCode(201);
    }

    public function show(Request $request,int $id,SalaryAccess $access)
    {
        $access->actor($request->user());
        return (new SalaryResource(SalaryAdvance::findOrFail($id)))->additional(['success'=>true]);
    }

    public function transition(SalaryWriteRequest $request,int $id,string $action,SalaryAdvanceService $service)
    {
        return (new SalaryResource($service->transition($request->user(),$id,$action,$request->all())))->additional(['success'=>true]);
    }

    public function mine(SalaryQueryRequest $request,SalaryAccess $access,DepartmentRequestContextService $contexts)
    {
        if($request->user()?->role==='institution_staff'){
            $contexts->forRoute($request);
            $profiles=Teacher::where('user_id',$request->user()->id)->where('status','active')->limit(2)->get(['id']);
            if($profiles->count()!==1)throw new AuthorizationException();
            $advances=SalaryAdvance::where('payee_type','teacher')->where('payee_id',$profiles->first()->id)->orderByDesc('id')->paginate($request->integer('per_page',25));
            return SalaryResource::collection($advances)->additional(['success'=>true]);
        }
        $actor=$access->actor($request->user(),true);
        $teacher=Teacher::where('user_id',$actor->id)->firstOrFail();
        $access->payee($actor,'teacher',(int)$teacher->id,true);
        $advances=SalaryAdvance::where('payee_type','teacher')->where('payee_id',$teacher->id)->orderByDesc('id')->paginate($request->integer('per_page',25));
        return SalaryResource::collection($advances)->additional(['success'=>true]);
    }
}
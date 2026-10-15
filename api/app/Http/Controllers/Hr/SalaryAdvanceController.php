<?php
namespace App\Http\Controllers\Hr;
use App\Http\Controllers\Controller;
use App\Http\Requests\Hr\SalaryQueryRequest;
use App\Http\Resources\SalaryResource;
use App\Models\{SalaryAdvance,Teacher};
use App\Services\Hr\SalaryAccess;
class SalaryAdvanceController extends Controller
{
    public function mine(SalaryQueryRequest $request,SalaryAccess $access)
    {
        $actor=$access->actor($request->user(),true);
        $teacher=Teacher::where('user_id',$actor->id)->firstOrFail();
        $access->payee($actor,'teacher',(int)$teacher->id,true);
        $advances=SalaryAdvance::where('payee_type','teacher')->where('payee_id',$teacher->id)->orderByDesc('id')->paginate($request->integer('per_page',25));
        return SalaryResource::collection($advances)->additional(['success'=>true]);
    }
}
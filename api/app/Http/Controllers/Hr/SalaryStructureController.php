<?php
namespace App\Http\Controllers\Hr;
use App\Http\Controllers\Controller;
use App\Http\Requests\Hr\{SalaryWriteRequest,SalaryQueryRequest};
use App\Http\Resources\SalaryResource;

use App\Models\{SalaryStructure,SalaryStructureLine};
use App\Services\Hr\SalaryAccess;
class SalaryStructureController extends Controller
{
    public function history(SalaryQueryRequest $r,string $type,int $id,SalaryAccess $access)
    {
        if($r->user()?->role==='institution_staff'){
            // D101 + D33: department staff see only their OWN salary history (own active Teacher or own StaffMember), with D91 context + staff.salary_structure.history
            app(\App\Services\DepartmentRequestContextService::class)->forRoute($r);
            $own=match($type){
                'teacher'=>\App\Models\Teacher::where('user_id',$r->user()->id)->where('status','active')->limit(2)->pluck('id'),
                'staff'=>\App\Models\StaffMember::where('user_id',$r->user()->id)->where('status','active')->limit(2)->pluck('id'),
                default=>collect(),
            };
            if($own->count()!==1 || (int)$own->first()!==$id) throw new \Illuminate\Auth\Access\AuthorizationException();
        } else $access->payee($r->user(),$type,$id,true);
        $rows=SalaryStructure::where('payee_type',$type)->where('payee_id',$id)->orderByDesc('effective_from')->paginate($r->integer('per_page',25));
        return SalaryResource::collection($rows)->additional(['success'=>true,'lines'=>SalaryStructureLine::whereIn('structure_id',$rows->pluck('id'))->get()->map(fn($line)=>$line->only(['structure_id','component_id','mode','value']))]);
    }
}

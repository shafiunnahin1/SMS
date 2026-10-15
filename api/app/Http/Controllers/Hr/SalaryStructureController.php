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
        $access->payee($r->user(),$type,$id,true);
        $rows=SalaryStructure::where('payee_type',$type)->where('payee_id',$id)->orderByDesc('effective_from')->paginate($r->integer('per_page',25));
        return SalaryResource::collection($rows)->additional(['success'=>true,'lines'=>SalaryStructureLine::whereIn('structure_id',$rows->pluck('id'))->get()->map(fn($line)=>$line->only(['structure_id','component_id','mode','value']))]);
    }
}

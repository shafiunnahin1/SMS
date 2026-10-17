<?php
namespace App\Http\Controllers\Hr;
use App\Http\Controllers\Controller;
use App\Http\Requests\Hr\{SalaryWriteRequest,SalaryQueryRequest};
use App\Http\Resources\SalaryResource;

use App\Models\BonusScheme;
use App\Services\Hr\{BonusSchemeService,SalaryAccess};
class BonusSchemeController extends Controller
{
    public function index(SalaryQueryRequest $r){app(SalaryAccess::class)->actor($r->user());return SalaryResource::collection(BonusScheme::orderByDesc('id')->paginate($r->integer('per_page',25)))->additional(['success'=>true]);}
    public function store(SalaryWriteRequest $r,BonusSchemeService $s){return (new SalaryResource($s->save($r->user(),$r->validated())))->additional(['success'=>true])->response()->setStatusCode(201);}
    public function show(\Illuminate\Http\Request $r,int $id){app(SalaryAccess::class)->actor($r->user());return (new SalaryResource(BonusScheme::findOrFail($id)))->additional(['success'=>true]);}
    public function update(SalaryWriteRequest $r,int $id,BonusSchemeService $s){return (new SalaryResource($s->save($r->user(),$r->validated(),$id)))->additional(['success'=>true]);}
    public function destroy(\Illuminate\Http\Request $r,int $id,BonusSchemeService $s){$s->end($r->user(),$id,true);return response()->json(['success'=>true]);}
    public function preview(\Illuminate\Http\Request $r,int $id,BonusSchemeService $s){return response()->json(['success'=>true,'data'=>$s->preview($r->user(),$id)]);}
    public function apply(\Illuminate\Http\Request $r,int $id,BonusSchemeService $s){return SalaryResource::collection($s->apply($r->user(),$id,$r->all()))->additional(['success'=>true]);}
    public function cancel(\Illuminate\Http\Request $r,int $id,BonusSchemeService $s){return (new SalaryResource($s->end($r->user(),$id)))->additional(['success'=>true]);}
}

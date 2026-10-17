<?php
namespace App\Http\Controllers\Hr;
use App\Http\Controllers\Controller;
use App\Http\Requests\Hr\{SalaryWriteRequest,SalaryQueryRequest};
use App\Http\Resources\SalaryResource;

use App\Models\SalaryComponent;
use App\Services\Hr\{SalaryAccess,SalaryComponentService};
class SalaryComponentController extends Controller
{
    public function index(SalaryQueryRequest $r){app(SalaryAccess::class)->actor($r->user());return SalaryResource::collection(SalaryComponent::orderBy('sort_order')->orderBy('id')->get())->additional(['success'=>true]);}
    public function store(SalaryWriteRequest $r,SalaryComponentService $s){return (new SalaryResource($s->save($r->user(),$r->validated())))->additional(['success'=>true])->response()->setStatusCode(201);}
    public function update(SalaryWriteRequest $r,int $id,SalaryComponentService $s){return (new SalaryResource($s->save($r->user(),$r->validated(),$id)))->additional(['success'=>true]);}
    public function destroy(\Illuminate\Http\Request $r,int $id,SalaryComponentService $s){$s->delete($r->user(),$id);return response()->json(['success'=>true]);}
}

<?php
namespace App\Http\Controllers\Hr;
use App\Http\Controllers\Controller;
use App\Http\Requests\Hr\{SalaryWriteRequest,SalaryQueryRequest};
use App\Http\Resources\SalaryResource;

use App\Models\SalaryRevision;
use App\Services\Hr\{SalaryAccess,SalaryRevisionService,RevisionLetterService};
class SalaryRevisionController extends Controller
{
    public function index(SalaryQueryRequest $r){
        app(SalaryAccess::class)->actor($r->user());$query=SalaryRevision::query();foreach(['status','payee_type','payee_id','batch_id'] as $field)if($r->filled($field))$query->where($field,$r->input($field));
        return SalaryResource::collection($query->orderByDesc('id')->paginate($r->integer('per_page',25)))->additional(['success'=>true]);
    }
    public function store(SalaryWriteRequest $r,SalaryRevisionService $s){return (new SalaryResource($s->propose($r->user(),$r->validated())))->additional(['success'=>true])->response()->setStatusCode(201);}
    public function show(\Illuminate\Http\Request $r,int $id){app(SalaryAccess::class)->actor($r->user());return (new SalaryResource(SalaryRevision::findOrFail($id)))->additional(['success'=>true]);}
    public function approve(\Illuminate\Http\Request $r,int $id,SalaryRevisionService $s){return (new SalaryResource($s->transition($r->user(),$id,'approve')))->additional(['success'=>true]);}
    public function reject(\Illuminate\Http\Request $r,int $id,SalaryRevisionService $s){return (new SalaryResource($s->transition($r->user(),$id,'reject')))->additional(['success'=>true]);}
    public function cancel(\Illuminate\Http\Request $r,int $id,SalaryRevisionService $s){return (new SalaryResource($s->transition($r->user(),$id,'cancel')))->additional(['success'=>true]);}
    public function letter(\Illuminate\Http\Request $r,int $id,RevisionLetterService $s){return response($s->render($r->user(),$id),200,['Content-Type'=>'application/pdf','Content-Disposition'=>'inline; filename="revision-'.$id.'.pdf"']);}
}

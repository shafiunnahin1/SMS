<?php
namespace App\Http\Controllers\Hr;
use App\Http\Controllers\Controller;
use App\Http\Requests\Hr\{SalaryWriteRequest,SalaryQueryRequest};
use App\Http\Resources\SalaryResource;

use App\Services\Hr\IncrementBatchService;
class IncrementBatchController extends Controller
{
    public function preview(SalaryWriteRequest $r,IncrementBatchService $s){return response()->json(['success'=>true,'data'=>$s->preview($r->user(),$r->validated())]);}
    public function store(SalaryWriteRequest $r,IncrementBatchService $s){return SalaryResource::collection(collect($s->store($r->user(),$r->validated('preview_token'))))->additional(['success'=>true]);}
}

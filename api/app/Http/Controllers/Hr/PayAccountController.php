<?php
namespace App\Http\Controllers\Hr;
use App\Http\Controllers\Controller;
use App\Http\Requests\Hr\{SalaryWriteRequest,SalaryQueryRequest};
use App\Http\Resources\SalaryResource;

use App\Services\Hr\PayAccountService;
class PayAccountController extends Controller
{
    public function show(\Illuminate\Http\Request $r,string $type,int $id,PayAccountService $s){return response()->json(['success'=>true,'data'=>$s->show($r->user(),$type,$id)]);}
    public function update(SalaryWriteRequest $r,string $type,int $id,PayAccountService $s){$d=$r->validated();return response()->json(['success'=>true,'data'=>$s->update($r->user(),$type,$id,$d['accounts'],$d['default_method']??null)]);}
}

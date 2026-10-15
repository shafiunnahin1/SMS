<?php

namespace App\Services\Hr;

use App\Models\{AuditLog,SalaryPayAccount,User};
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class PayAccountService
{
    private const METHODS=['cash','bank','bkash','nagad','rocket','cheque'];
    public function __construct(private SalaryAccess $access) {}

    private function masked(string $type,int $id): array
    {
        return SalaryPayAccount::where('payee_type',$type)->where('payee_id',$id)->orderBy('id')->get()->map(fn($row)=>[
            'id'=>$row->id,'method'=>$row->method,'account_name'=>$row->account_name,'masked_number'=>$row->maskedNumber(),
            'bank_name'=>$row->bank_name,'branch_name'=>$row->branch_name,'routing_number'=>$row->routing_number,'is_default'=>$row->is_default])->all();
    }

    public function show(User $actor,string $type,int $id): array
    {
        $this->access->payee($actor,$type,$id);
        return $this->masked($type,$id);
    }

    /** Caller selects default_method; row ownership and is_default are always server-derived. */
    public function update(User $actor,string $type,int $id,array $accounts,?string $defaultMethod=null): array
    {
        $this->access->payee($actor,$type,$id);
        return DB::transaction(function()use($actor,$type,$id,$accounts,$defaultMethod){
            Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            $this->access->payee($actor,$type,$id);
            Validator::make(['accounts'=>$accounts,'default_method'=>$defaultMethod],[
                'accounts'=>'required|array|list|min:1|max:6','default_method'=>'nullable|in:'.implode(',',self::METHODS),
                'accounts.*'=>'array:method,account_name,account_number,bank_name,branch_name,routing_number',
                'accounts.*.method'=>'required|in:'.implode(',',self::METHODS).'|distinct',
                'accounts.*.account_name'=>'nullable|string|max:120',
                'accounts.*.account_number'=>'nullable|string|min:4|max:64|regex:/^[A-Za-z0-9 -]+$/D',
                'accounts.*.bank_name'=>'nullable|string|max:100','accounts.*.branch_name'=>'nullable|string|max:100',
                'accounts.*.routing_number'=>'nullable|string|max:20',
            ])->validate();
            $query=fn()=>SalaryPayAccount::where('payee_type',$type)->where('payee_id',$id);
            $existing=$query()->get();
            $methods=array_unique([...$existing->pluck('method')->all(),...array_column($accounts,'method')]);
            if($defaultMethod!==null && !in_array($defaultMethod,$methods,true)) throw ValidationException::withMessages(['default_method'=>__('salary.invalid')]);
            $defaultMethod??=$existing->firstWhere('is_default',true)?->method??$accounts[0]['method'];
            foreach($accounts as $data){
                $row=$query()->where('method',$data['method'])->first()??new SalaryPayAccount(['payee_type'=>$type,'payee_id'=>$id,'method'=>$data['method']]);
                $row->fill($data); $row->is_default=$row->method===$defaultMethod; $row->save();
                AuditLog::create(['institution_id'=>Tenancy::current()->id,'user_id'=>$actor->id,'action'=>'salary.account.updated',
                    'model'=>'SalaryPayAccount','model_id'=>$row->id]);
            }
            foreach($query()->get() as $row) {
                $default=$row->method===$defaultMethod;
                if($row->is_default!==$default){$row->is_default=$default;$row->save();}
            }
            return $this->masked($type,$id);
        });
    }
}

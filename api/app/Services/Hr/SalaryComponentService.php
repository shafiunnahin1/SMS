<?php
namespace App\Services\Hr;
use App\Models\{AuditLog,SalaryComponent,User};
use App\Support\Tenancy;
use Illuminate\Support\Facades\{DB,Validator};

class SalaryComponentService
{
    public const SYSTEM=['house_rent'=>'percent_basic','medical'=>'fixed','transport'=>'fixed'];
    public function seedDefaults(): void
    {
        foreach(self::SYSTEM as $code=>$calc) SalaryComponent::firstOrCreate(['code'=>$code],['name'=>['bn'=>__('salary.component_'.$code,[],'bn'),
            'en'=>__('salary.component_'.$code,[],'en'),'ar'=>__('salary.component_'.$code,[],'ar')],'type'=>'earning','calc'=>$calc,'is_system'=>true]);
    }
    public function save(User $actor,array $input,?int $id=null): SalaryComponent
    {
        app(SalaryAccess::class)->actor($actor);
        return DB::transaction(function()use($actor,$input,$id){
            Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();app(SalaryAccess::class)->actor($actor);
            $row=$id?SalaryComponent::findOrFail($id):new SalaryComponent();
            $data=Validator::make(array_merge($id?$row->only(['code','name','type','calc','taxable','is_pf','is_active','sort_order']):[],$input),[
                'code'=>'required|alpha_dash:ascii|max:30','name'=>'required|array:bn,en,ar','name.bn'=>'required|string|max:100',
                'name.en'=>'required|string|max:100','name.ar'=>'required|string|max:100','type'=>'required|in:earning,deduction',
                'calc'=>'required|in:fixed,percent_basic','taxable'=>'sometimes|boolean','is_pf'=>'sometimes|boolean','is_active'=>'sometimes|boolean','sort_order'=>'nullable|integer',
            ])->validate();
            if($id && $data['code']!==$row->code) throw \Illuminate\Validation\ValidationException::withMessages(['code'=>__('salary.invalid')]);
            if(SalaryComponent::where('code',$data['code'])->when($id,fn($q)=>$q->whereKeyNot($id))->exists()) throw \Illuminate\Validation\ValidationException::withMessages(['code'=>__('salary.invalid')]);
            if(isset(self::SYSTEM[$data['code']])){
                if($data['type']!=='earning' || $data['calc']!==self::SYSTEM[$data['code']]) throw \Illuminate\Validation\ValidationException::withMessages(['code'=>__('salary.invalid')]);
                $row->is_system=true;
            }
            $row->fill($data)->save();
            AuditLog::create(['institution_id'=>Tenancy::current()->id,'user_id'=>$actor->id,'action'=>'salary.component.saved','model'=>'SalaryComponent','model_id'=>$row->id]);
            return $row->fresh();
        });
    }
    public function delete(User $actor,int $id): void
    {
        app(SalaryAccess::class)->actor($actor);
        DB::transaction(function()use($actor,$id){
            Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();app(SalaryAccess::class)->actor($actor);
            $row=SalaryComponent::findOrFail($id);
            if(isset(self::SYSTEM[$row->code])) throw new \App\Exceptions\BusinessException(__('salary.immutable'),'salary_immutable',409);
            $row->delete();
            AuditLog::create(['institution_id'=>Tenancy::current()->id,'user_id'=>$actor->id,'action'=>'salary.component.deleted','model'=>'SalaryComponent','model_id'=>$id]);
        });
    }
}

<?php
namespace App\Services\Hr;
use App\Exceptions\BusinessException;
use App\Models\{AuditLog,BonusScheme,SalaryStructure,StaffMember,Teacher,User};
use App\Support\{Money,Tenancy};
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\{DB,Validator};

class BonusSchemeService
{
    public function __construct(private SalaryAccess $access,private SalaryCalculator $money,private SalaryCalendar $calendar) {}
    public function save(User $actor,array $input,?int $id=null): BonusScheme
    {
        $this->access->actor($actor);
        return DB::transaction(function()use($actor,$input,$id){
            Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();$this->access->actor($actor);
            $row=$id?BonusScheme::findOrFail($id):new BonusScheme();
            if($id && $row->status!=='draft') throw new BusinessException(__('salary.conflict'),'revision_conflict',409);
            $allowed=['name','kind','pay_month','basis','value','min_service_months','prorate_below_months','applies_to','max_amount','taxable'];
            if(array_diff(array_keys($input),$allowed)) throw \Illuminate\Validation\ValidationException::withMessages(['scheme'=>__('salary.invalid')]);
            $data=Validator::make(array_merge($id?$row->only($allowed):[],$input),[
                'name'=>'required|string|max:100','kind'=>'sometimes|in:festival,performance,annual,other','pay_month'=>'required|date_format:Y-m',
                'basis'=>'required|in:basic,gross,fixed','value'=>'required','min_service_months'=>'sometimes|integer|min:0',
                'prorate_below_months'=>'sometimes|integer|min:0','max_amount'=>'nullable','taxable'=>'sometimes|boolean',
                'applies_to'=>'nullable|array:payee_types,designations,exclude','applies_to.payee_types'=>'sometimes|array|list',
                'applies_to.payee_types.*'=>'in:teacher,staff','applies_to.designations'=>'sometimes|array|list',
                'applies_to.designations.*'=>'string|max:80','applies_to.exclude'=>'sometimes|array|list',
                'applies_to.exclude.*'=>'array:type,id','applies_to.exclude.*.type'=>'required|in:teacher,staff','applies_to.exclude.*.id'=>'required|integer|min:1',
            ])->validate();
            $data['value']=Money::format($this->money->paisa($data['value']));
            if(isset($data['max_amount'])) $data['max_amount']=Money::format($this->money->paisa($data['max_amount']));
            $row->fill($data);if(!$id){$row->status='draft';$row->created_by=$actor->id;}$row->save();
            $this->audit($actor,$row,'saved');return $row->fresh();
        });
    }
    private function audit(User $actor,BonusScheme $row,string $action): void
    {
        AuditLog::create(['institution_id'=>Tenancy::current()->id,'user_id'=>$actor->id,'action'=>'salary.bonus.'.$action,'model'=>'BonusScheme','model_id'=>$row->id]);
    }
    public function preview(User $actor,int $id): array
    {
        $this->access->actor($actor);$scheme=BonusScheme::findOrFail($id);$rules=$scheme->applies_to??[];$end=CarbonImmutable::parse($scheme->pay_month.'-01')->endOfMonth();$rows=[];
        foreach(['teacher'=>Teacher::class,'staff'=>StaffMember::class] as $type=>$model){
            foreach($model::whereIn('status',['active','on_leave'])->orderBy('id')->get() as $payee){
                $reason=null;$months=$payee->joining_date?$this->calendar->serviceMonths($payee->joining_date->toDateString(),$end->toDateString()):0;
                if(!$payee->joining_date || $payee->joining_date->gt($end)) $reason='service';
                if(isset($rules['payee_types']) && !in_array($type,$rules['payee_types'],true)) $reason='type';
                if(isset($rules['designations']) && !in_array($payee->designation,$rules['designations'],true)) $reason='designation';
                if(collect($rules['exclude']??[])->contains(fn($e)=>$e['type']===$type && (int)$e['id']===$payee->id)) $reason='excluded';
                if($months<$scheme->min_service_months) $reason='service';
                $structure=SalaryStructure::where('payee_type',$type)->where('payee_id',$payee->id)->where('effective_from','<=',$end->toDateString())
                    ->where(fn($q)=>$q->whereNull('effective_to')->orWhere('effective_to','>=',$end->toDateString()))->orderByDesc('effective_from')->first();
                $amount=0;
                if(!$reason){
                    $value=$this->money->paisa($scheme->value);
                    $numerator=$value;$denominator=1;
                    if($scheme->basis==='fixed') $amount=$value;
                    elseif(!$structure) $reason='structure';
                    else{
                        $base=Money::toPaisa($structure->{$scheme->basis});
                        if($base>0 && $value>intdiv(SalaryCalculator::MAX_PAISA*10000,$base)) throw \Illuminate\Validation\ValidationException::withMessages(['value'=>__('salary.invalid')]);
                        $numerator=$base*$value;$denominator=10000;
                    }
                    // Match payroll_ref.bonus: percentage and service proration, then ONE half-up rounding.
                    if(!$reason) $amount=$this->roundedAmount($numerator,$denominator,$months,(int)$scheme->prorate_below_months);
                    if($scheme->max_amount!==null) $amount=min($amount,Money::toPaisa($scheme->max_amount));
                }
                $rows[]=['type'=>$type,'id'=>$payee->id,'service_months'=>$months,'amount'=>Money::format($amount),'excluded_reason'=>$reason];
            }
        }
        return $rows;
    }
    private function roundedAmount(int $numerator,int $denominator,int $months,int $below): int
    {
        if($below===0 || $months>=$below) return Money::ratio($numerator,1,$denominator);
        // Split quotient/remainders before multiplying to avoid a large combined denominator/product.
        $main=intdiv($numerator,$denominator)*$months;
        $extra=($numerator%$denominator)*$months;
        $result=intdiv($main,$below);
        $remainder=($main%$below)+intdiv($extra,$denominator);
        $result+=intdiv($remainder,$below);
        $remainder%=$below;
        $difference=$below-2*$remainder;
        if($difference<=0 || ($difference===1 && 2*($extra%$denominator)>=$denominator)) $result++;
        return $result;
    }

    public function apply(User $actor,int $id): never
    {
        $this->access->actor($actor);BonusScheme::findOrFail($id);
        throw new BusinessException(__('salary.dependency'),'dependency_pending',409);
    }
    public function end(User $actor,int $id,bool $delete=false): ?BonusScheme
    {
        $this->access->actor($actor);
        return DB::transaction(function()use($actor,$id,$delete){
            Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();$this->access->actor($actor);
            $row=BonusScheme::findOrFail($id);
            if($row->status==='applied') throw new BusinessException(__('salary.dependency'),'dependency_pending',409);
            if($delete && $row->status!=='draft') throw new BusinessException(__('salary.conflict'),'revision_conflict',409);
            if($row->status==='cancelled') return $row;
            $this->audit($actor,$row,$delete?'deleted':'cancelled');
            if($delete){$row->delete();return null;}$row->status='cancelled';$row->save();return $row;
        });
    }
}

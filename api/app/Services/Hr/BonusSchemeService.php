<?php
namespace App\Services\Hr;
use App\Exceptions\BusinessException;
use App\Models\{AuditLog,BonusScheme,SalaryAdjustment,SalaryStructure,StaffMember,Teacher,User};
use App\Support\{Money,Tenancy};
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\{DB,Validator};

class BonusSchemeService
{
    public function __construct(private SalaryAccess $access,private SalaryCalculator $money,private SalaryCalendar $calendar,private PayrollApproval $approval) {}
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

    private function sourceFingerprint(string $type,int $id,CarbonImmutable $end): string
    {
        $model=$type==='teacher'?Teacher::class:StaffMember::class;$payee=$model::findOrFail($id);
        $structure=SalaryStructure::where('payee_type',$type)->where('payee_id',$id)->where('effective_from','<=',$end->toDateString())
            ->where(fn($q)=>$q->whereNull('effective_to')->orWhere('effective_to','>=',$end->toDateString()))->orderByDesc('effective_from')->first();
        $source=['type'=>$type,'id'=>$id,'status'=>$payee->status,'joining_date'=>$payee->joining_date?->toDateString(),'designation'=>$payee->designation,
            'structure'=>$structure?['id'=>$structure->id,'basic'=>$structure->basic,'gross'=>$structure->gross,'effective_from'=>$structure->effective_from->toDateString(),
                'effective_to'=>$structure->effective_to?->toDateString()]:null];
        return hash('sha256',json_encode($source,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES));
    }
    public function apply(User $actor,int $id,array $input=[]): \Illuminate\Database\Eloquent\Collection
    {
        $this->access->actor($actor);
        if($input) throw \Illuminate\Validation\ValidationException::withMessages(['scheme'=>__('salary.invalid')]);
        return DB::transaction(function()use($actor,$id){
            $this->approval->lock($actor);$scheme=BonusScheme::findOrFail($id);
            if($scheme->status==='applied'){
                $ids=$scheme->application_snapshot['adjustment_ids']??null;
                if(!is_array($ids)) throw new BusinessException(__('salary.conflict'),'bonus_conflict',409);
                $rows=SalaryAdjustment::whereIn('id',$ids)->orderBy('id')->get();
                if($rows->modelKeys()!==array_map('intval',$ids)) throw new BusinessException(__('salary.conflict'),'bonus_conflict',409);
                return $rows;
            }
            if($scheme->status!=='draft') throw new BusinessException(__('salary.conflict'),'revision_conflict',409);
            $policy=$this->approval->policy();$prepared=$scheme->created_by===null?null:(int)$scheme->created_by;
            $self=$this->approval->authorize($actor,$prepared,$policy);$preview=$this->preview($actor,$id);
            $end=CarbonImmutable::parse($scheme->pay_month.'-01')->endOfMonth();
            $definition=$scheme->only(['id','name','kind','pay_month','basis','value','min_service_months','prorate_below_months','applies_to','max_amount','taxable']);
            $effects=new \Illuminate\Database\Eloquent\Collection();$lines=[];
            foreach($preview as $line){
                $sourceFingerprint=$this->sourceFingerprint($line['type'],(int)$line['id'],$end);$adjustment=null;
                $amount=Money::toPaisa($line['amount']);
                if($line['excluded_reason']===null && $amount>0){
                    $adjustment=SalaryAdjustment::create(['payee_type'=>$line['type'],'payee_id'=>$line['id'],'kind'=>'bonus','direction'=>'earning',
                        'amount'=>$line['amount'],'month'=>$scheme->pay_month,'taxable'=>$scheme->taxable,'scheme_id'=>$scheme->id,'description'=>'Bonus: '.$scheme->name,
                        'status'=>'approved','created_by'=>$prepared,'approved_by'=>$actor->id]);
                    $effects->push($adjustment);
                }
                $lines[]=$line+['source_fingerprint'=>$sourceFingerprint,'adjustment_id'=>$adjustment?->id];
            }
            $adjustmentIds=$effects->modelKeys();
            $scheme->application_snapshot=['scheme'=>$definition,'scheme_fingerprint'=>hash('sha256',json_encode($definition,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES)),
                'policy'=>['allow_self_approval'=>$policy['allow_self_approval'],'prepared_by'=>$prepared,'approved_by'=>$actor->id,'self_approved'=>$self],
                'lines'=>$lines,'adjustment_ids'=>$adjustmentIds,'applied_at'=>now()->toIso8601String()];
            $scheme->status='applied';$scheme->applied_at=now();$scheme->save();
            $this->approval->audit($actor,$scheme,'bonus.applied',['adjustment_ids'=>$adjustmentIds,'self_approved'=>$self]);
            return $effects;
        });
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

<?php
namespace App\Services\Hr;

use App\Exceptions\BusinessException;
use App\Models\{SalaryRevision,SalaryStructure,SalaryStructureLine,User};
use App\Support\{Money,Tenancy};
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

class SalarySnapshotService
{
    public function __construct(private SalaryAccess $access,private SalaryCalculator $calculator) {}
    private function invalid(string $key): never { throw ValidationException::withMessages([$key=>__('salary.invalid')]); }

    private function canonical(mixed $value): mixed
    {
        if(!is_array($value)) return $value;
        if(!array_is_list($value)) ksort($value);
        return array_map(fn($v)=>$this->canonical($v),$value);
    }

    public function policy(): array
    {
        $settings=data_get(Tenancy::current()->settings??[],'payroll',[]);
        if(!is_array($settings)) $this->invalid('payroll');
        $defaults=['min_basic'=>'0.00','max_backdate_months'=>12,'allow_backdated_decrement'=>false,
            'decrement_requires_acknowledgement'=>true,'allow_self_approval'=>'if_sole_approver'];
        $policy=array_replace($defaults,array_intersect_key($settings,$defaults));
        $this->calculator->paisa($policy['min_basic'],'min_basic');
        if(!is_int($policy['max_backdate_months']) || $policy['max_backdate_months']<0 ||
            !is_bool($policy['allow_backdated_decrement']) || !is_bool($policy['decrement_requires_acknowledgement']) ||
            !in_array($policy['allow_self_approval'],['never','if_sole_approver','always'],true)) $this->invalid('payroll');
        return $policy;
    }

    public function build(User $actor,array $input,bool $alreadyApproved=false): array
    {
        $payee=$this->access->payee($actor,$input['payee_type'],(int)$input['payee_id']);
        $date=CarbonImmutable::createFromFormat('!Y-m-d',$input['effective_from'])->toDateString();
        $query=fn()=>SalaryStructure::where('payee_type',$input['payee_type'])->where('payee_id',$payee->id);
        if($query()->where('effective_from','>=',$date)->exists()) $this->invalid('effective_from');
        $source=$query()->orderByDesc('effective_from')->first();
        if(($input['kind']==='initial')!==($source===null) || ($source && $source->effective_to!==null)) $this->invalid('kind');
        $oldLines=$source?SalaryStructureLine::where('structure_id',$source->id)->orderBy('component_id')->get()->map(fn($line)=>[
            'component_id'=>$line->component_id,'mode'=>$line->mode,'value'=>$line->value])->all():[];
        $old=$source?$this->calculator->calculate($source->basic,$oldLines):null;
        if($source && $old['gross']!==$source->gross) $this->invalid('source');
        $basic=$source?Money::toPaisa($source->basic):$this->calculator->paisa($input['basic']??null,'basic');
        $lines=$source?$oldLines:($input['lines']??[]);
        if($source){
            $target=$input['target']??'basic';$index=null;$current=$basic;
            if($target!=='basic'){
                foreach($old['lines'] as $n=>$line) if('component:'.$line['component']['code']===$target) $index=$n;
                if($index===null) $this->invalid('target');
                $current=Money::toPaisa($lines[$index]['value']);
            }
            $value=$this->calculator->paisa($input['change_value']??null,'change_value');
            $mode=$input['change_mode']??'set';
            if($mode==='percent'){
                if($current>0 && $value>intdiv(SalaryCalculator::MAX_PAISA*10000,$current)) $this->invalid('change_value');
                $delta=Money::ratio($current,$value,10000);
            } else $delta=$value;
            $changed=$mode==='set'?$value:$current+($input['kind']==='decrement'?-$delta:$delta);
            if($changed<0 || $changed>SalaryCalculator::MAX_PAISA) $this->invalid('change_value');
            if($target==='basic') $basic=$changed;else $lines[$index]['value']=Money::format($changed);
        }
        $result=$this->calculator->calculate(Money::format($basic),$lines);
        $policy=$this->policy();
        if($basic<$this->calculator->paisa($policy['min_basic'],'min_basic')) $this->invalid('basic');
        $decrement=$input['kind']==='decrement' || ($old && ($basic<Money::toPaisa($old['basic']) || Money::toPaisa($result['gross'])<Money::toPaisa($old['gross'])));
        if($decrement && !trim($input['reason']??'')) $this->invalid('reason');
        if(!$alreadyApproved && $date<now()->toDateString() && $decrement && !$policy['allow_backdated_decrement']) $this->invalid('effective_from');
        if($date<CarbonImmutable::now()->startOfDay()->subMonthsNoOverflow($policy['max_backdate_months'])->toDateString()) $this->invalid('effective_from');
        $sourceData=$source?['id'=>$source->id,'basic'=>$source->basic,'gross'=>$source->gross,'effective_from'=>$source->effective_from->toDateString(),
            'effective_to'=>$source->effective_to?->toDateString(),'designation'=>$source->designation,'grade'=>$source->grade,'lines'=>$old['lines']]:null;
        $evidence=['source'=>$sourceData,'result'=>$result,'policy'=>$policy,'decrement'=>(bool)$decrement,
            'payee'=>['type'=>$input['payee_type'],'id'=>$payee->id,'status'=>$payee->status,
                'joining_date'=>$payee->joining_date?->toDateString(),'leaving_date'=>$payee->leaving_date?->toDateString()]];
        return $evidence+['request'=>$input,'fingerprint'=>hash('sha256',json_encode($this->canonical($evidence),JSON_THROW_ON_ERROR))];
    }

    public function current(User $actor,SalaryRevision $revision): array
    {
        $saved=$revision->calculation_snapshot;
        if(!is_array($saved) || !is_array($saved['request']??null) || !is_string($saved['fingerprint']??null) ||
            array_diff(['payee_type','payee_id','kind','effective_from'],array_keys($saved['request']))) {
            throw new BusinessException(__('salary.stale'),'stale_revision',409);
        }
        try {$fresh=$this->build($actor,$saved['request'],$revision->status==='approved');}
        catch(ValidationException|\Illuminate\Database\Eloquent\ModelNotFoundException $error) {
            throw new BusinessException(__('salary.stale'),'stale_revision',409);
        }
        if(!hash_equals($saved['fingerprint']??'',$fresh['fingerprint'])) throw new BusinessException(__('salary.stale'),'stale_revision',409);
        return $fresh;
    }
}

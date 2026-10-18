<?php
namespace App\Services\Hr;
use App\Exceptions\BusinessException;
use App\Models\{SalaryAdvance,SalaryStructure,User};
use App\Support\{Money,Tenancy};
use Illuminate\Support\Facades\{DB,Validator};
use Illuminate\Validation\ValidationException;
class SalaryAdvanceService
{
    public function __construct(private SalaryAccess $access,private PayrollApproval $approval,private SalaryCalculator $money) {}
    private function snapshot(User $actor,array $terms): array
    {
        $payee=$this->access->payee($actor,$terms['payee_type'],(int)$terms['payee_id']);if(!in_array($payee->status,['active','on_leave'],true))$this->invalid();
        $today=now()->toDateString();$source=SalaryStructure::where('payee_type',$terms['payee_type'])->where('payee_id',$terms['payee_id'])->where('effective_from','<=',$today)->where(fn($q)=>$q->whereNull('effective_to')->orWhere('effective_to','>=',$today))->first();
        if(!$source)$this->invalid();
        return ['terms'=>$terms,'source'=>['id'=>$source->id,'payee_type'=>$source->payee_type,'payee_id'=>$source->payee_id,'basic'=>$source->basic,'gross'=>$source->gross,'effective_from'=>$source->effective_from->toDateString(),'effective_to'=>$source->effective_to?->toDateString()],'payee'=>['id'=>$payee->id,'status'=>$payee->status],'policy'=>$this->approval->policy()];
    }
    private function limits(array $snapshot,?int $exclude=null): void
    {
        $terms=$snapshot['terms'];$policy=$snapshot['policy'];$q=SalaryAdvance::where('payee_type',$terms['payee_type'])->where('payee_id',$terms['payee_id'])->whereIn('status',['approved','active']);if($exclude)$q->whereKeyNot($exclude);
        $existing=$q->get();if($existing->count()>=$policy['max_active_advances'])$this->invalid();
        $gross=Money::toPaisa($snapshot['source']['gross']);$months=$policy['max_advance_months'];
        $sum=Money::toPaisa($terms['amount']);foreach($existing as $a)$sum+=Money::toPaisa($a->amount)-Money::toPaisa($a->recovered);
        if($gross<=0 || $months>intdiv(PHP_INT_MAX,$gross) || $sum>$gross*$months)$this->invalid();
    }
    private function reviewed(User $actor,SalaryAdvance $row): array
    {
        $stored=$row->terms_snapshot;$actual=$this->snapshot($actor,$stored['terms']);
        if($stored!=$actual)throw new BusinessException(__('salary.conflict'),'stale_advance',409);
        $this->limits($actual,$row->id);return $actual;
    }
    public function store(User $actor,array $input): SalaryAdvance
    {
        $this->access->actor($actor);
        return DB::transaction(function()use($actor,$input){
            $this->approval->lock($actor);$allowed=['payee_type','payee_id','amount','reason','installments','installment_amount','recover_from_month'];if(array_diff(array_keys($input),$allowed))$this->invalid();
            $data=Validator::make($input,['payee_type'=>'required|in:teacher,staff','payee_id'=>'required|integer|min:1','amount'=>'required','reason'=>'nullable|string|max:255','installments'=>'sometimes|integer|min:1|max:2147483647','installment_amount'=>'sometimes|required','recover_from_month'=>'required|date_format:Y-m'])->validate();
            $amount=$this->money->paisa($data['amount']);$count=(int)($data['installments']??1);if($amount<=0)$this->invalid();
            $part=array_key_exists('installment_amount',$data)?$this->money->paisa($data['installment_amount']):Money::ratio($amount,1,$count);
            if($part>$amount || (array_key_exists('installment_amount',$data) && $part===0))$this->invalid();
            $data['amount']=Money::format($amount);$data['installments']=$count;$data['installment_amount']=Money::format($part);
            $snapshot=$this->snapshot($actor,$data);$this->limits($snapshot);
            $row=SalaryAdvance::create($data+['terms_snapshot'=>$snapshot,'requested_by'=>$actor->id]);$this->approval->audit($actor,$row,'advance.requested');return $row;
        });
    }
    public function transition(User $actor,int $id,string $action,array $input=[]): SalaryAdvance
    {
        $this->access->actor($actor);
        return DB::transaction(function()use($actor,$id,$action,$input){
            $this->approval->lock($actor);$row=SalaryAdvance::findOrFail($id);$this->access->payee($actor,$row->payee_type,$row->payee_id);
            if($action==='disburse'){
                $data=Validator::make($input,['date'=>'required|date_format:Y-m-d|before_or_equal:today','payment_method'=>'required|in:cash,bank,bkash,nagad,rocket,other'])->validate();if(array_diff(array_keys($input),['date','payment_method']))$this->invalid();
                if($row->expense_id!==null){$expense=\App\Models\Expense::findOrFail($row->expense_id);if($expense->expense_date->toDateString()!==$data['date'] || $expense->payment_method!==$data['payment_method'])$this->conflict();return $row;}
                if($row->status!=='approved')$this->conflict();$this->reviewed($actor,$row);
                app(\App\Services\ExpenseService::class)->disburseAdvance($row,$data['date'],$data['payment_method'],$actor);
                $this->approval->audit($actor,$row,'advance.disbursed');return $row->fresh();
            }
            $self=$this->approval->authorize($actor,$row->requested_by,$this->approval->policy());
            if($action==='skip-installment'){
                if(array_diff(array_keys($input),['month','reason']))$this->invalid();$data=Validator::make($input,['month'=>'required|date_format:Y-m','reason'=>'required|string|max:255'])->validate();
                if($row->status!=='active' || $data['month']<$row->recover_from_month || $data['month']<now()->format('Y-m'))$this->conflict();
                $skips=$row->skipped_months??[];foreach($skips as $skip)if($skip['month']===$data['month']){if($skip['reason']!==$data['reason'])$this->conflict();return $row;}
                $skips[]=$data+['approved_by'=>$actor->id,'at'=>now()->toIso8601String()];$row->skipped_months=$skips;$row->save();$this->approval->audit($actor,$row,'advance.skipped',['month'=>$data['month'],'self_approved'=>$self]);return $row;
            }
            if($action==='write-off'){
                if(array_diff(array_keys($input),['reason']))$this->invalid();$data=Validator::make($input,['reason'=>'required|string|max:255'])->validate();
                if($row->status==='written_off'){
                    $reason=\App\Models\AuditLog::where('model','SalaryAdvance')->where('model_id',$row->id)->where('action','salary.advance.written_off')->first()?->new_data['reason']??null;
                    if($reason!==$data['reason'])$this->conflict();return $row;
                }
                if($row->status!=='active')$this->conflict();$row->status='written_off';$row->save();$this->approval->audit($actor,$row,'advance.written_off',['reason'=>$data['reason'],'self_approved'=>$self]);return $row;
            }
            if($input)$this->invalid();$state=match($action){'approve'=>'approved','reject'=>'rejected',default=>null};if(!$state)$this->conflict();if($row->status===$state)return $row;
            if($row->status!=='requested')$this->conflict();if($action==='approve')$this->reviewed($actor,$row);
            $row->status=$state;if($action==='approve')$row->approved_by=$actor->id;$row->save();$this->approval->audit($actor,$row,'advance.'.$state,['self_approved'=>$self]);return $row;
        });
    }
    public function recovery(User $actor,int $id,string $month,string $net): array
    {
        $this->access->actor($actor);$row=SalaryAdvance::findOrFail($id);$this->access->payee($actor,$row->payee_type,$row->payee_id);
        Validator::make(['month'=>$month],['month'=>'required|date_format:Y-m'])->validate();if($row->status!=='active')$this->conflict();
        $skips=$row->skipped_months??[];$skip=$month<$row->recover_from_month || collect($skips)->contains(fn($s)=>$s['month']===$month);
        $start=\Carbon\CarbonImmutable::parse($row->recover_from_month.'-01');$at=\Carbon\CarbonImmutable::parse($month.'-01');
        $elapsed=($at->year-$start->year)*12+$at->month-$start->month+1-count(array_filter($skips,fn($s)=>$s['month']<=$month));
        return app(AdvanceRecoveryCalculator::class)->calculate($row->amount,$row->recovered,$row->installment_amount,$net,(string)$this->approval->policy()['min_net_after_recovery'],$skip,$elapsed>=$row->installments);
    }
    private function invalid(): never { throw ValidationException::withMessages(['advance'=>__('salary.invalid')]); }
    private function conflict(): never { throw new BusinessException(__('salary.conflict'),'advance_conflict',409); }
}

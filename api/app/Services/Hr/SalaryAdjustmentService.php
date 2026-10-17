<?php
namespace App\Services\Hr;
use App\Exceptions\BusinessException;
use App\Models\{SalaryAdjustment,SalaryStructure,User};
use App\Support\Money;
use Illuminate\Support\Facades\{DB,Storage,Validator};
use Illuminate\Validation\ValidationException;
class SalaryAdjustmentService
{
    public function __construct(private SalaryAccess $access,private PayrollApproval $approval,private SalaryCalculator $money) {}
    public function store(User $actor,array $input): SalaryAdjustment
    {
        $this->access->actor($actor);$path=null;
        try{return DB::transaction(function()use($actor,$input,&$path){
            $this->approval->lock($actor);
            $allowed=['payee_type','payee_id','kind','direction','amount','month','taxable','description','attachment'];
            if(array_diff(array_keys($input),$allowed)) $this->invalid();
            $data=Validator::make($input,['payee_type'=>'required|in:teacher,staff','payee_id'=>'required|integer|min:1','kind'=>'required|in:bonus,allowance,overtime,extra_class,arrear,fine,recovery,other',
                'direction'=>'required|in:earning,deduction','amount'=>'required','month'=>'required|date_format:Y-m','taxable'=>'sometimes|boolean','description'=>'nullable|string|max:255','attachment'=>'nullable|file|mimes:pdf,jpg,jpeg,png|max:5120'])->validate();
            $this->access->payee($actor,$data['payee_type'],(int)$data['payee_id']);$amount=$this->money->paisa($data['amount']);if($amount<=0) $this->invalid();
            if(($data['kind']==='fine' || $data['kind']==='bonus') && !trim($data['description']??'')) $this->invalid();
            $expected=in_array($data['kind'],['fine','recovery'],true)?'deduction':'earning';if($data['kind']!=='other' && $data['direction']!==$expected) $this->invalid();
            $policy=$this->approval->policy();
            if($data['kind']==='fine' && $policy['max_fine_percent']!==null){
                $pct=$this->money->paisa($policy['max_fine_percent']);if($pct>10000) $this->invalid();
                $end=\Carbon\CarbonImmutable::parse($data['month'].'-01')->endOfMonth()->toDateString();
                $source=SalaryStructure::where('payee_type',$data['payee_type'])->where('payee_id',$data['payee_id'])->where('effective_from','<=',$end)->where(fn($q)=>$q->whereNull('effective_to')->orWhere('effective_to','>=',$end))->first();
                if(!$source || $amount>Money::ratio(Money::toPaisa($source->gross),$pct,10000)) $this->invalid();
            }
            if($data['attachment']??null){$path=$data['attachment']->storeAs('institutions/'.\App\Support\Tenancy::current()->id.'/salary/adjustments',\Illuminate\Support\Str::uuid().'.'.$data['attachment']->extension(),'private');if(!$path) $this->invalid();$data['attachment']=$path;}
            $data['amount']=Money::format($amount);$row=SalaryAdjustment::create($data+['created_by'=>$actor->id,'status'=>'pending']);
            $this->approval->audit($actor,$row,'adjustment.created');return $row;
        });}catch(\Throwable $e){if($path) Storage::disk('private')->delete($path);throw $e;}
    }
    public function transition(User $actor,int $id,string $action): SalaryAdjustment
    {
        $this->access->actor($actor);
        return DB::transaction(function()use($actor,$id,$action){
            $this->approval->lock($actor);$row=SalaryAdjustment::findOrFail($id);$this->access->payee($actor,$row->payee_type,$row->payee_id);
            $state=match($action){'approve'=>'approved','cancel'=>'cancelled',default=>throw new BusinessException(__('salary.conflict'),'adjustment_conflict',409)};
            $self=$this->approval->authorize($actor,$row->created_by,$this->approval->policy());
            if($row->status===$state)return $row;
            if(!in_array($row->status,$action==='approve'?['pending']:['pending','approved'],true) || $row->payroll_item_id!==null) throw new BusinessException(__('salary.conflict'),'adjustment_conflict',409);
            $row->status=$state;if($action==='approve')$row->approved_by=$actor->id;$row->save();$this->approval->audit($actor,$row,'adjustment.'.$state,['self_approved'=>$self]);return $row;
        });
    }
    private function invalid(): never { throw ValidationException::withMessages(['adjustment'=>__('salary.invalid')]); }
}

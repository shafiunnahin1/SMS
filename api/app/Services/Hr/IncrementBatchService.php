<?php
namespace App\Services\Hr;
use App\Exceptions\BusinessException;
use App\Models\{LeaveApplication,SalaryRevision,SalaryStructure,StaffMember,Teacher,User};
use App\Support\{Money,Tenancy};
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\{Crypt,DB,Validator};
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class IncrementBatchService
{
    public function __construct(private SalaryAccess $access,private SalaryCalculator $calculator,private SalarySnapshotService $snapshots,private SalaryRevisionService $revisions) {}
    private function input(array $input): array
    {
        $data=Validator::make($input,[
            'percent'=>'required_without:amount|prohibits:amount','amount'=>'required_without:percent|prohibits:percent',
            'round_to'=>'sometimes|integer|in:1,10,50,100','effective_from'=>'required|date_format:Y-m-d',
            'min_months_since_last'=>'sometimes|integer|min:0','payee_types'=>'required|array|list|min:1|max:2',
            'payee_types.*'=>'required|in:teacher,staff|distinct','exclude'=>'sometimes|array|list',
            'exclude.*'=>'array:type,id','exclude.*.type'=>'required|in:teacher,staff','exclude.*.id'=>'required|integer|min:1',
            'label'=>'nullable|string|max:100','arrears_policy'=>'sometimes|in:auto,none',
        ])->validate();
        $this->calculator->paisa($data['percent']??$data['amount'],'change_value');
        return $data+['round_to'=>1,'min_months_since_last'=>12,'exclude'=>[],'arrears_policy'=>'auto'];
    }

    private function rows(User $actor,array $data): array
    {
        $out=[];$date=CarbonImmutable::parse($data['effective_from']);
        foreach($data['payee_types'] as $type){
            $model=$type==='teacher'?Teacher::class:StaffMember::class;
            foreach($model::whereIn('status',['active','on_leave'])->orderBy('id')->get() as $payee){
                if(collect($data['exclude'])->contains(fn($e)=>$e['type']===$type && (int)$e['id']===$payee->id)) continue;
                $old=SalaryStructure::where('payee_type',$type)->where('payee_id',$payee->id)->where('effective_from','<',$data['effective_from'])->orderByDesc('effective_from')->first();
                if(!$old || $old->effective_to || $old->effective_from->copy()->addMonthsNoOverflow($data['min_months_since_last'])->gt($date)) continue;
                $unpaid=false;
                foreach(LeaveApplication::where('status','approved')->where($type==='teacher'?'user_id':'staff_id',$type==='teacher'?$payee->user_id:$payee->id)
                    ->where('from_date','<=',$data['effective_from'])->where('to_date','>=',$data['effective_from'])->get() as $leave){
                    $snapshot=app(LeaveService::class)->snapshot($leave);
                    if(!$snapshot['is_paid'] && in_array($data['effective_from'],$snapshot['dates'],true)) $unpaid=true;
                }
                if($unpaid) continue;
                $proposal=['payee_type'=>$type,'payee_id'=>$payee->id,'kind'=>'increment','change_mode'=>isset($data['percent'])?'percent':'amount',
                    'change_value'=>$data['percent']??$data['amount'],'effective_from'=>$data['effective_from'],'arrears_policy'=>$data['arrears_policy']];
                $preview=$this->snapshots->build($actor,$proposal);
                $step=$data['round_to']*100;$rounded=Money::ratio(Money::toPaisa($preview['result']['basic']),1,$step)*$step;
                $proposal['change_mode']='set';$proposal['change_value']=Money::format($rounded);
                $preview=$this->snapshots->build($actor,$proposal);
                $out[]=['type'=>$type,'id'=>$payee->id,'old_basic'=>$old->basic,'new_basic'=>$preview['result']['basic'],
                    'new_gross'=>$preview['result']['gross'],'fingerprint'=>$preview['fingerprint'],'proposal'=>$proposal];
            }
        }
        return $out;
    }
    public function preview(User $actor,array $input): array
    {
        $this->access->actor($actor);$data=$this->input($input);$rows=$this->rows($actor,$data);
        $packet=['institution_id'=>Tenancy::current()->id,'actor_id'=>$actor->id,'batch_id'=>(string)Str::uuid(),'input'=>$data,'rows'=>$rows];
        return ['rows'=>$rows,'preview_token'=>Crypt::encryptString(json_encode($packet,JSON_THROW_ON_ERROR))];
    }
    public function store(User $actor,string $token): array
    {
        $this->access->actor($actor);
        try{$packet=json_decode(Crypt::decryptString($token),true,flags:JSON_THROW_ON_ERROR);}
        catch(\Illuminate\Contracts\Encryption\DecryptException|\JsonException $e){throw ValidationException::withMessages(['preview_token'=>__('salary.invalid')]);}
        if(($packet['institution_id']??null)!==Tenancy::current()->id || ($packet['actor_id']??null)!==$actor->id) abort(403);
        return DB::transaction(function()use($actor,$packet){
            Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();$this->access->actor($actor);
            $existing=SalaryRevision::where('batch_id',$packet['batch_id'])->orderBy('id')->get();
            if($existing->isNotEmpty()) return $existing->all();
            $rows=$this->rows($actor,$packet['input']);
            if($rows!==$packet['rows']) throw new BusinessException(__('salary.stale'),'stale_revision',409);
            if(!$rows) throw ValidationException::withMessages(['preview_token'=>__('salary.invalid')]);
            return array_map(fn($row)=>$this->revisions->propose($actor,$row['proposal'],['id'=>$packet['batch_id'],'label'=>$packet['input']['label']??null]),$rows);
        });
    }
}

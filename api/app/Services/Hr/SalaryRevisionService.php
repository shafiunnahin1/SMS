<?php
namespace App\Services\Hr;

use App\Exceptions\BusinessException;
use App\Jobs\SendSmsJob;
use App\Models\{AuditLog,SalaryRevision,User};
use App\Notifications\GeneralNotification;
use App\Support\Tenancy;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\{DB,Storage,Validator};
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class SalaryRevisionService
{
    public function __construct(private SalaryAccess $access,private SalarySnapshotService $snapshots,private SalaryStructureService $structures) {}

    public function propose(User $actor,array $input): SalaryRevision
    {
        $this->access->actor($actor);
        return DB::transaction(function()use($actor,$input){
            Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            $this->access->actor($actor);
            $allowed=['payee_type','payee_id','kind','basic','lines','change_mode','change_value','target','effective_from','reason',
                'arrears_policy','designation','grade','acknowledgement'];
            if(array_diff(array_keys($input),$allowed)) throw ValidationException::withMessages(['revision'=>__('salary.invalid')]);
            $data=Validator::make($input,[
                'payee_type'=>'required|in:teacher,staff','payee_id'=>'required|integer|min:1','kind'=>'required|in:initial,increment,decrement,promotion,correction',
                'basic'=>'required_if:kind,initial','lines'=>'nullable|array|list',
                'lines.*'=>'array:component_id,mode,value','lines.*.component_id'=>'required|integer|min:1|distinct',
                'lines.*.mode'=>'sometimes|in:fixed,percent_basic','lines.*.value'=>'required','change_mode'=>'sometimes|in:set,amount,percent',
                'change_value'=>'required_unless:kind,initial','target'=>['sometimes','regex:/^(basic|component:[A-Za-z0-9_-]{1,30})$/D'],
                'effective_from'=>'required|date_format:Y-m-d','reason'=>'nullable|string|max:255','arrears_policy'=>'sometimes|in:auto,none',
                'designation'=>'nullable|string|max:80','grade'=>'nullable|string|max:30',
                'acknowledgement'=>'nullable|file|mimes:pdf,jpg,jpeg,png|max:5120',
            ])->validate();
            $file=$data['acknowledgement']??null;unset($data['acknowledgement']);
            if($data['kind']!=='initial' && (array_key_exists('basic',$data)||array_key_exists('lines',$data))) throw ValidationException::withMessages(['lines'=>__('salary.invalid')]);
            if($data['kind']==='initial' && (array_key_exists('change_value',$data) || ($data['target']??'basic')!=='basic' || ($data['change_mode']??'set')!=='set')) {
                throw ValidationException::withMessages(['change_value'=>__('salary.invalid')]);
            }
            $data+=['change_mode'=>'set','target'=>'basic','arrears_policy'=>'auto'];
            $snapshot=$this->snapshots->build($actor,$data);
            $row=SalaryRevision::create(['payee_type'=>$data['payee_type'],'payee_id'=>$data['payee_id'],'kind'=>$data['kind'],
                'change_mode'=>$data['change_mode'],'change_value'=>$data['change_value']??null,'target'=>$data['target'],
                'old_basic'=>$snapshot['source']['basic']??null,'old_gross'=>$snapshot['source']['gross']??null,
                'new_basic'=>$snapshot['result']['basic'],'new_gross'=>$snapshot['result']['gross'],'calculation_snapshot'=>$snapshot,
                'effective_from'=>$data['effective_from'],'reason'=>$data['reason']??null,'arrears_policy'=>$data['arrears_policy'],'proposed_by'=>$actor->id,'status'=>'proposed']);
            if($file){$row->acknowledged_path=$file->storeAs('institutions/'.Tenancy::current()->id.'/hr/payroll',Str::uuid().'.'.$file->extension(),'private');$row->save();}
            $notice=false;
            if($snapshot['decrement']){
                $payee=$this->access->payee($actor,$row->payee_type,$row->payee_id);
                $user=$payee->user_id?User::where('institution_id',Tenancy::current()->id)->whereKey($payee->user_id)->first():null;
                if($user) $user->notify(new GeneralNotification(__('salary.decrement_notice',[],$user->locale),__('salary.decrement_notice',[],$user->locale),'salary_revision',['revision_id'=>$row->id]));
                $notice=$user!==null;
                $phone=$user?->phone??$payee->phone??null;
                if($phone && (($user?->notification_preferences??[])['sms']??true)){
                    SendSmsJob::dispatch($phone,__('salary.decrement_notice',[],$user?->locale??'bn'),Tenancy::current()->id,$actor->id,true)->afterCommit();
                    $notice=true;
                }
            }
            $this->audit($row,$actor,'proposed',['arrears_policy'=>$row->arrears_policy,'decrement_notice'=>$notice]);
            return $row;
        });
    }

    private function audit(SalaryRevision $row,User $actor,string $state,array $data=[]): void
    {
        AuditLog::create(['institution_id'=>$row->institution_id,'user_id'=>$actor->id,'action'=>'salary.revision.'.$state,
            'model'=>'SalaryRevision','model_id'=>$row->id,'new_data'=>$data?:null]);
    }

    public function transition(User $actor,int $id,string $action): SalaryRevision
    {
        $this->access->actor($actor);
        return DB::transaction(function()use($actor,$id,$action){
            Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            $fresh=$this->access->actor($actor);
            $row=SalaryRevision::findOrFail($id);
            if(!in_array($action,['approve','reject','cancel'],true)) throw ValidationException::withMessages(['action'=>__('salary.invalid')]);
            if(in_array($action,['approve','reject'],true) && $fresh->role!=='admin') throw new AuthorizationException();
            $state=['approve'=>'approved','reject'=>'rejected','cancel'=>'cancelled'][$action];
            if($action==='cancel' && $fresh->role!=='admin' && $row->proposed_by!==$actor->id) throw new AuthorizationException();
            if(($state==='approved' && in_array($row->status,['approved','applied'],true)) || $row->status===$state) {
                $prior=AuditLog::where('model','SalaryRevision')->where('model_id',$row->id)->where('action','salary.revision.'.$state)->orderByDesc('id')->first();
                if((int)$prior?->user_id===$actor->id) return $row;
                throw new BusinessException(__('salary.conflict'),'revision_conflict',409);
            }
            if($row->status!=='proposed' && !($action==='cancel' && $row->status==='approved')) throw new BusinessException(__('salary.conflict'),'revision_conflict',409);
            $self=false;
            if($action==='approve'){
                $snapshot=$this->snapshots->current($actor,$row);
                $policy=$snapshot['policy'];
                if($row->proposed_by===$actor->id){
                    $count=User::where('institution_id',Tenancy::current()->id)->where('role','admin')->where('is_active',true)->count();
                    if($count!==1 || $policy['allow_self_approval']==='never') throw new AuthorizationException();
                    $self=true;
                }
                $hasAck=$row->acknowledged_path && Storage::disk('private')->exists($row->acknowledged_path);
                $notice=AuditLog::where('model','SalaryRevision')->where('model_id',$row->id)->where('action','salary.revision.proposed')->first()?->new_data['decrement_notice']??false;
                if($snapshot['decrement'] && !$hasAck && !$notice) throw ValidationException::withMessages(['notice'=>__('salary.invalid')]);
                if($snapshot['decrement'] && $policy['decrement_requires_acknowledgement'] &&
                    (!$row->acknowledged_path || !Storage::disk('private')->exists($row->acknowledged_path))) throw ValidationException::withMessages(['acknowledgement'=>__('salary.invalid')]);
                if($row->arrears_policy==='auto' && $row->effective_from->toDateString()<now()->startOfMonth()->toDateString()) throw new BusinessException(__('salary.dependency'),'dependency_pending',409);
                $row->approved_by=$actor->id;$row->approved_at=now();
            }
            $row->status=$state;$row->save();
            $this->audit($row,$actor,$state,['self_approved'=>$self,'arrears_policy'=>$row->arrears_policy]);
            if($action==='approve' && $row->effective_from->toDateString()<=now()->toDateString()) $this->structures->apply($row->id,$actor);
            return $row->fresh();
        });
    }
}

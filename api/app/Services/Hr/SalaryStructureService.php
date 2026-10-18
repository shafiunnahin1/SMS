<?php
namespace App\Services\Hr;

use App\Exceptions\BusinessException;
use App\Jobs\SendSmsJob;
use App\Models\{AuditLog,SalaryRevision,SalaryStructure,SalaryStructureLine,Teacher,User};
use App\Notifications\GeneralNotification;
use App\Support\Tenancy;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class SalaryStructureService
{
    public function __construct(private SalaryAccess $access,private SalarySnapshotService $snapshots) {}

    public function apply(int $id,User $actor): SalaryStructure
    {
        $this->access->actor($actor);
        return DB::transaction(function()use($id,$actor){
            Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            $this->access->actor($actor);
            $revision=SalaryRevision::findOrFail($id);
            if($revision->status==='applied') return SalaryStructure::where('revision_id',$revision->id)->firstOrFail();
            if($revision->status!=='approved' || $revision->effective_from->toDateString()>now()->toDateString()) throw new BusinessException(__('salary.conflict'),'revision_conflict',409);
            $snapshot=$this->snapshots->current($actor,$revision);
            if($revision->arrears_policy==='auto') app(\App\Services\Hr\PayrollArrearsService::class)->amount($revision);   // D86/D104: settled history or fail closed
            if($revision->approved_by===null) throw new BusinessException(__('salary.conflict'),'revision_conflict',409);
            $source=$snapshot['source'];
            if($source){
                // D86's only period-close exception: tenant scope, exact old start/id, open row, one column only.
                $closed=SalaryStructure::whereKey($source['id'])->where('payee_type',$revision->payee_type)->where('payee_id',$revision->payee_id)
                    ->where('effective_from',$source['effective_from'])->whereNull('effective_to')->update(['effective_to'=>$revision->effective_from->copy()->subDay()->toDateString()]);
                if($closed!==1) throw new BusinessException(__('salary.stale'),'stale_revision',409);
            }
            $structure=SalaryStructure::create(['payee_type'=>$revision->payee_type,'payee_id'=>$revision->payee_id,
                'basic'=>$snapshot['result']['basic'],'gross'=>$snapshot['result']['gross'],'effective_from'=>$revision->effective_from,
                'designation'=>$snapshot['request']['designation']??$source['designation']??null,
                'grade'=>$snapshot['request']['grade']??$source['grade']??null,'revision_id'=>$revision->id,'created_by'=>$actor->id]);
            foreach($snapshot['result']['lines'] as $line) SalaryStructureLine::create(['structure_id'=>$structure->id,
                'component_id'=>$line['component_id'],'mode'=>$line['mode'],'value'=>$line['value']]);
            $year=now()->year;$prefix='REV-'.$year.'-';$seq=0;
            foreach(SalaryRevision::where('letter_no','like',$prefix.'%')->pluck('letter_no') as $letter){
                if(preg_match('/^REV-'.$year.'-([0-9]+)$/D',$letter,$match)) $seq=max($seq,(int)$match[1]);
            }
            $revision->fill(['status'=>'applied','letter_no'=>$prefix.($seq+1)])->save();
            if($revision->payee_type==='teacher'){
                $cache=['salary'=>$structure->basic,'house_rent'=>'0.00','medical_allowance'=>'0.00','transport_allowance'=>'0.00'];
                foreach($snapshot['result']['lines'] as $line){
                    $field=['house_rent'=>'house_rent','medical'=>'medical_allowance','transport'=>'transport_allowance'][$line['component']['code']]??null;
                    if($field && $line['component']['type']==='earning') $cache[$field]=$line['amount'];
                }
                Teacher::findOrFail($revision->payee_id)->forceFill($cache)->save();
            }
            AuditLog::create(['institution_id'=>$revision->institution_id,'user_id'=>$actor->id,'action'=>'salary.revision.applied',
                'model'=>'SalaryRevision','model_id'=>$revision->id,'new_data'=>['structure_id'=>$structure->id,'arrears_policy'=>$revision->arrears_policy]]);
            $payee=$this->access->payee($actor,$revision->payee_type,$revision->payee_id);
            $user=$payee->user_id?User::where('institution_id',Tenancy::current()->id)->whereKey($payee->user_id)->first():null;
            if($user) $user->notify(new GeneralNotification(__('salary.updated',[],$user->locale),__('salary.updated',[],$user->locale),'salary_revision',['revision_id'=>$revision->id]));
            $phone=$user?->phone??$payee->phone??null;
            if($phone && (($user?->notification_preferences??[])['sms']??true)) SendSmsJob::dispatch($phone,__('salary.updated',[],$user?->locale??'bn'),Tenancy::current()->id,$actor->id,true)->afterCommit();
            return $structure;
        });
    }
}

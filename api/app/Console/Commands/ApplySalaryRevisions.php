<?php
namespace App\Console\Commands;
use App\Models\{SalaryRevision,User};
use App\Services\Hr\SalaryStructureService;
use App\Support\Tenancy;
use Illuminate\Console\Command;

class ApplySalaryRevisions extends Command
{
    protected $signature='payroll:apply-revisions';
    protected $description='Apply due approved salary revisions within each active institution';
    public function handle(SalaryStructureService $structures): int
    {
        $applied=0;$blocked=0;
        Tenancy::each(function($institution)use($structures,&$applied,&$blocked){
            foreach(SalaryRevision::where('status','approved')->where('effective_from','<=',now()->toDateString())->orderBy('effective_from')->orderBy('id')->cursor() as $revision){
                $actor=User::where('institution_id',$institution->id)->whereKey($revision->approved_by)->where('role','admin')->where('is_active',true)->first();
                if(!$actor){$blocked++;continue;}
                try{$structures->apply($revision->id,$actor);$applied++;}
                catch(\App\Exceptions\BusinessException|\Illuminate\Auth\Access\AuthorizationException|\Illuminate\Validation\ValidationException $error){$blocked++;}
            }
        });
        $this->info('applied='.$applied.' blocked='.$blocked);
        return $blocked?self::FAILURE:self::SUCCESS;
    }
}

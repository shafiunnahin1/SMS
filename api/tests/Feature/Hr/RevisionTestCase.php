<?php
namespace Tests\Feature\Hr;
use App\Models\SalaryComponent;
use App\Services\Hr\{SalaryRevisionService,SalaryStructureService};

abstract class RevisionTestCase extends LeaveTestCase
{
    protected function revisionService(): SalaryRevisionService { return app(SalaryRevisionService::class); }
    protected function initial($actor,string $type,int $id,array $extra=[]): \App\Models\SalaryRevision
    {
        $component=SalaryComponent::firstOrCreate(['code'=>'house_rent'],['name'=>['en'=>'House rent'],'type'=>'earning','calc'=>'percent_basic']);
        return $this->revisionService()->propose($actor,array_replace(['payee_type'=>$type,'payee_id'=>$id,'kind'=>'initial',
            'basic'=>'20000.00','lines'=>[['component_id'=>$component->id,'mode'=>'percent_basic','value'=>'40.00']],
            'effective_from'=>'2026-10-01','arrears_policy'=>'none'],$extra));
    }
    protected function increment($actor,string $type,int $id,array $extra=[]): \App\Models\SalaryRevision
    {
        return $this->revisionService()->propose($actor,array_replace(['payee_type'=>$type,'payee_id'=>$id,'kind'=>'increment',
            'change_mode'=>'percent','change_value'=>'10.00','effective_from'=>'2026-10-15','arrears_policy'=>'none'],$extra));
    }
}

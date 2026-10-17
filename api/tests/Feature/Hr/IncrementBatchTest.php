<?php
namespace Tests\Feature\Hr;
use App\Models\{SalaryRevision,SalaryStructure};
use App\Services\Hr\IncrementBatchService;
use App\Exceptions\BusinessException;

class IncrementBatchTest extends RevisionTestCase
{
    public function test_preview_then_store_creates_one_batch_of_proposals_and_retry_does_not_duplicate(): void
    {
        [$i,$admin,$staff]=$this->setupHr();$first=$this->initial($admin,'staff',$staff->id);$this->revisionService()->transition($admin,$first->id,'approve');
        $service=app(IncrementBatchService::class);
        $preview=$service->preview($admin,['percent'=>'10.00','round_to'=>50,'effective_from'=>'2027-10-01','payee_types'=>['staff']]);
        $this->assertCount(1,$preview['rows']);$this->assertSame('22000.00',$preview['rows'][0]['new_basic']);
        $this->assertSame('30800.00',$preview['rows'][0]['new_gross']);
        $rows=$service->store($admin,$preview['preview_token']);$again=$service->store($admin,$preview['preview_token']);
        $this->assertSame($rows[0]->id,$again[0]->id);$this->assertSame('proposed',$rows[0]->status);
        $this->assertNotNull($rows[0]->batch_id);$this->assertSame(2,SalaryRevision::count());$this->assertSame(1,SalaryStructure::count());
    }
    public function test_exclusion_minimum_age_and_tampered_or_stale_preview_cannot_create_proposals(): void
    {
        [$i,$admin,$staff]=$this->setupHr();$first=$this->initial($admin,'staff',$staff->id);$this->revisionService()->transition($admin,$first->id,'approve');
        $service=app(IncrementBatchService::class);$input=['amount'=>'105.00','effective_from'=>'2026-10-16','payee_types'=>['staff']];
        $this->assertSame([],$service->preview($admin,$input)['rows']);
        $preview=$service->preview($admin,$input+['min_months_since_last'=>0,'round_to'=>100]);
        $this->assertSame('20100.00',$preview['rows'][0]['new_basic']);
        $this->assertSame([],$service->preview($admin,$input+['min_months_since_last'=>0,'exclude'=>[['type'=>'staff','id'=>$staff->id]]])['rows']);
        try{$service->store($admin,'tampered');$this->fail('Tampered token accepted');}
        catch(\Illuminate\Validation\ValidationException $e){$this->assertArrayHasKey('preview_token',$e->errors());}
        $staff->update(['designation'=>'Changed job']);$staff->update(['status'=>'inactive']);
        $this->expectException(BusinessException::class);$service->store($admin,$preview['preview_token']);
    }
}

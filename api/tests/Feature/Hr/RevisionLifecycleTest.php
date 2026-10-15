<?php
namespace Tests\Feature\Hr;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog,SalaryComponent,SalaryRevision,SalaryStructure,User};
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class RevisionLifecycleTest extends RevisionTestCase
{
    public function test_reviewed_snapshot_rejects_source_component_and_policy_changes(): void
    {
        [$i,$admin,$staff]=$this->setupHr();
        $row=$this->initial($admin,'staff',$staff->id);
        $component=SalaryComponent::first();$component->update(['name'=>['en'=>'Changed after review']]);
        try{$this->revisionService()->transition($admin,$row->id,'approve');$this->fail('Stale component accepted');}
        catch(BusinessException $e){$this->assertSame('stale_revision',$e->errorCode);}
        $this->assertSame('proposed',$row->fresh()->status);$this->assertSame(0,SalaryStructure::count());
        $new=$this->initial($admin,'staff',$staff->id);
        $i->update(['settings'=>['payroll'=>['min_basic'=>'100.00']]]);
        $this->expectException(BusinessException::class);$this->expectExceptionMessage(__('salary.stale'));
        $this->revisionService()->transition($admin,$new->id,'approve');
    }

    public function test_maker_checker_blocks_accountant_and_multi_admin_self_approval_but_audits_sole_exception(): void
    {
        [$i,$admin,$staff]=$this->setupHr();
        $second=User::create(['institution_id'=>$i->id,'name'=>'Second admin','email'=>'second@example.test','password'=>'Fixture@1234','role'=>'admin','is_active'=>true]);
        $accountant=$this->makeUser($i,'accountant');
        $row=$this->initial($admin,'staff',$staff->id);
        foreach([$admin,$accountant] as $actor){
            try{$this->revisionService()->transition($actor,$row->id,'approve');$this->fail('Maker-checker bypass');}
            catch(AuthorizationException $e){$this->assertSame('proposed',$row->fresh()->status);}
        }
        $this->revisionService()->transition($second,$row->id,'approve');
        $second->update(['is_active'=>false]);
        $next=$this->increment($admin,'staff',$staff->id);
        $this->revisionService()->transition($admin,$next->id,'approve');
        $this->revisionService()->transition($admin,$next->id,'approve');
        $audit=AuditLog::where('action','salary.revision.approved')->where('model_id',$next->id)->first();
        $this->assertTrue($audit->new_data['self_approved']);
        $this->assertSame(2,SalaryStructure::count());
        $this->assertStringNotContainsString('22000',AuditLog::where('action','like','salary.revision.%')->get()->toJson());
    }

    public function test_decrement_reason_acknowledgement_and_minimum_are_required_and_private(): void
    {
        Storage::fake('private');[$i,$admin]=$this->setupHr();[$teacher,$profile]=$this->teacher($i);
        $first=$this->initial($admin,'teacher',$profile->id);$this->revisionService()->transition($admin,$first->id,'approve');
        try{$this->increment($admin,'teacher',$profile->id,['kind'=>'decrement']);$this->fail('Reason absent');}
        catch(ValidationException $e){$this->assertArrayHasKey('reason',$e->errors());}
        $row=$this->increment($admin,'teacher',$profile->id,['kind'=>'decrement','reason'=>'Documented change']);
        try{$this->revisionService()->transition($admin,$row->id,'approve');$this->fail('Ack absent');}
        catch(ValidationException $e){$this->assertArrayHasKey('acknowledgement',$e->errors());}
        $acked=$this->increment($admin,'teacher',$profile->id,['kind'=>'decrement','reason'=>'Documented change','acknowledgement'=>UploadedFile::fake()->create('ack.pdf',2,'application/pdf')]);
        Storage::disk('private')->assertExists($acked->acknowledged_path);
        $this->assertStringStartsWith('institutions/'.$i->id.'/hr/payroll/',$acked->acknowledged_path);
        $this->revisionService()->transition($admin,$acked->id,'approve');
        $this->assertSame('18000.00',$profile->fresh()->salary);
        $this->assertGreaterThanOrEqual(1,$teacher->notifications()->where('data','like','%salary_revision%')->count());
        $i->update(['settings'=>['payroll'=>['min_basic'=>'19000.00']]]);
        $this->expectException(ValidationException::class);
        $this->increment($admin,'teacher',$profile->id,['kind'=>'decrement','reason'=>'Below minimum','effective_from'=>'2026-10-16']);
    }

    public function test_past_month_auto_arrears_fail_closed_and_rejected_cancelled_applied_transitions_conflict(): void
    {
        [$i,$admin,$staff]=$this->setupHr();
        $auto=$this->initial($admin,'staff',$staff->id,['effective_from'=>'2026-09-01','arrears_policy'=>'auto']);
        try{$this->revisionService()->transition($admin,$auto->id,'approve');$this->fail('Future arrears integration assumed');}
        catch(BusinessException $e){$this->assertSame('dependency_pending',$e->errorCode);}
        $this->assertSame('proposed',$auto->fresh()->status);
        $this->revisionService()->transition($admin,$auto->id,'reject');
        $this->revisionService()->transition($admin,$auto->id,'reject');
        try{$this->revisionService()->transition($admin,$auto->id,'approve');$this->fail('Rejected reapproved');}
        catch(BusinessException $e){$this->assertSame(409,$e->status);}
        $none=$this->initial($admin,'staff',$staff->id,['effective_from'=>'2026-09-01']);
        $this->revisionService()->transition($admin,$none->id,'approve');
        $this->assertSame('none',AuditLog::where('action','salary.revision.applied')->first()->new_data['arrears_policy']);
        $future=$this->increment($admin,'staff',$staff->id,['effective_from'=>'2026-11-01']);
        $this->revisionService()->transition($admin,$future->id,'approve');
        $this->revisionService()->transition($admin,$future->id,'cancel');
        $this->assertSame('cancelled',$future->fresh()->status);
        $this->expectException(BusinessException::class);
        $this->revisionService()->transition($admin,$none->id,'cancel');
    }

    public function test_later_structure_makes_previously_reviewed_proposal_stale_and_foreign_revision_is_hidden(): void
    {
        [$i,$admin,$staff]=$this->setupHr();
        $first=$this->initial($admin,'staff',$staff->id);$this->revisionService()->transition($admin,$first->id,'approve');
        $a=$this->increment($admin,'staff',$staff->id,['effective_from'=>'2026-10-17']);
        $b=$this->increment($admin,'staff',$staff->id,['effective_from'=>'2026-10-16']);
        $this->travelTo('2026-10-16 12:00:00');$this->revisionService()->transition($admin,$b->id,'approve');
        try{$this->revisionService()->transition($admin,$a->id,'approve');$this->fail('Stale source accepted');}
        catch(BusinessException $e){$this->assertSame('stale_revision',$e->errorCode);}
        $other=$this->makeInstitution('revision-other');
        $foreign=$this->asTenant($other,fn()=>SalaryRevision::factory()->create());
        $this->expectException(\Illuminate\Database\Eloquent\ModelNotFoundException::class);
        $this->revisionService()->transition($admin,$foreign->id,'approve');
    }
    public function test_initial_inputs_reject_unused_change_fields_and_old_backdate_exceeds_policy(): void
    {
        [$i,$admin,$staff]=$this->setupHr();
        foreach([['change_value'=>1.001],['change_mode'=>'percent'],['target'=>'component:house_rent'],['effective_from'=>'2025-10-14']] as $extra){
            try{$this->initial($admin,'staff',$staff->id,$extra);$this->fail('Invalid initial accepted');}
            catch(ValidationException $e){$this->assertNotEmpty($e->errors());}
        }
        $this->assertSame(0,SalaryRevision::count());
    }

    public function test_backdated_decrement_is_denied_and_staff_notice_is_queued_before_approval(): void
    {
        [$i,$admin,$staff]=$this->setupHr();
        $first=$this->initial($admin,'staff',$staff->id);$this->revisionService()->transition($admin,$first->id,'approve');
        try{$this->increment($admin,'staff',$staff->id,['kind'=>'decrement','reason'=>'Change','effective_from'=>'2026-10-14']);$this->fail('Backdated decrement allowed');}
        catch(ValidationException $e){$this->assertArrayHasKey('effective_from',$e->errors());}
        $staff->update(['phone'=>'01711111111']);
        $i->update(['settings'=>['payroll'=>['decrement_requires_acknowledgement'=>false]]]);
        $next=$this->increment($admin,'staff',$staff->id,['kind'=>'decrement','reason'=>'Change']);
        \Illuminate\Support\Facades\Queue::assertPushed(\App\Jobs\SendSmsJob::class,fn($job)=>$job->message===__('salary.decrement_notice',[],'bn') && $job->afterCommit);
        $this->revisionService()->transition($admin,$next->id,'approve');
        $this->assertSame('applied',$next->fresh()->status);
    }

    public function test_future_approved_revision_rechecks_policy_before_apply(): void
    {
        [$i,$admin,$staff]=$this->setupHr();
        $initial=$this->initial($admin,'staff',$staff->id);$this->revisionService()->transition($admin,$initial->id,'approve');
        $next=$this->increment($admin,'staff',$staff->id,['effective_from'=>'2026-10-20']);
        $this->revisionService()->transition($admin,$next->id,'approve');
        $i->update(['settings'=>['payroll'=>['min_basic'=>'100.00']]]);
        $this->travelTo('2026-10-20 12:00:00');
        try{app(\App\Services\Hr\SalaryStructureService::class)->apply($next->id,$admin);$this->fail('Stale approved revision applied');}
        catch(BusinessException $e){$this->assertSame('stale_revision',$e->errorCode);}
        $this->assertSame('approved',$next->fresh()->status);
        $this->assertNull(SalaryStructure::first()->effective_to);
        $this->assertSame(1,SalaryStructure::count());
    }

    public function test_component_target_revision_keeps_basic_and_changes_exact_line_parameter(): void
    {
        [$i,$admin,$staff]=$this->setupHr();
        $first=$this->initial($admin,'staff',$staff->id);$this->revisionService()->transition($admin,$first->id,'approve');
        $next=$this->increment($admin,'staff',$staff->id,['target'=>'component:house_rent','change_mode'=>'amount','change_value'=>'5.00']);
        $this->assertSame('20000.00',$next->new_basic);
        $this->assertSame('29000.00',$next->new_gross);
        $this->revisionService()->transition($admin,$next->id,'approve');
        $line=\App\Models\SalaryStructureLine::where('structure_id',SalaryStructure::where('revision_id',$next->id)->value('id'))->first();
        $this->assertSame('45.00',$line->value);
        $this->assertSame('percent_basic',$line->mode);
    }

    public function test_previously_approved_future_decrement_can_apply_late_within_month_without_becoming_new_backdate(): void
    {
        Storage::fake('private');[$i,$admin]=$this->setupHr();[$teacher,$profile]=$this->teacher($i);
        $first=$this->initial($admin,'teacher',$profile->id);$this->revisionService()->transition($admin,$first->id,'approve');
        $next=$this->increment($admin,'teacher',$profile->id,['kind'=>'decrement','reason'=>'Acknowledged future change',
            'effective_from'=>'2026-10-20','acknowledgement'=>UploadedFile::fake()->create('ack.pdf',2,'application/pdf')]);
        $this->revisionService()->transition($admin,$next->id,'approve');
        $this->travelTo('2026-10-21 12:00:00');
        app(\App\Services\Hr\SalaryStructureService::class)->apply($next->id,$admin);
        $this->assertSame('18000.00',$profile->fresh()->salary);
        $this->assertSame('2026-10-20',SalaryStructure::where('revision_id',$next->id)->first()->effective_from->toDateString());
        $this->assertSame('applied',$next->fresh()->status);
    }

    public function test_client_generated_totals_and_nested_snapshot_fields_are_rejected(): void
    {
        [$i,$admin,$staff]=$this->setupHr();
        $component=SalaryComponent::factory()->create();
        foreach([['new_gross'=>'99999.00'],['lines'=>[['component_id'=>$component->id,'value'=>'1.00','amount'=>'99999.00']]]] as $extra){
            try{$this->initial($admin,'staff',$staff->id,$extra);$this->fail('Client generated field accepted');}
            catch(ValidationException $e){$this->assertNotEmpty($e->errors());}
        }
        $this->assertSame(0,SalaryRevision::count());
    }

}

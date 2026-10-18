<?php
namespace Tests\Feature\Hr;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, LeaveApplication, StaffMember};
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Validation\ValidationException;

class LeaveActorTest extends LeaveTestCase
{
    public function test_exactly_one_actor_and_teacher_only_own_pending_cancel(): void
    {
        [$i,$admin,$staff,$type]=$this->setupHr();[$teacher]=$this->teacher($i);
        try { $this->service()->create($this->input($staff,$type)+['user_id'=>$teacher->id],$admin); $this->fail('Expected exactly one'); }
        catch(ValidationException $e){ $this->assertArrayHasKey('user_id',$e->errors()); }
        $row=$this->service()->create(['user_id'=>$teacher->id,'leave_type_id'=>$type->id,'from_date'=>'2026-10-20','to_date'=>'2026-10-20'],$teacher);
        try { $this->service()->transition($row->id,'approve',[],$teacher); $this->fail('Teacher cannot approve'); }
        catch(AuthorizationException $e){ $this->assertSame('pending',$row->fresh()->status); }
        $this->service()->transition($row->id,'cancel',['reason'=>'Changed plans'],$teacher);
        $this->service()->transition($row->id,'cancel',['reason'=>'Changed plans'],$teacher);
        $this->assertSame(1,AuditLog::where('action','leave.cancelled')->count());
        $this->assertSame(1,LeaveApplication::count());
        try { $this->service()->transition($row->id,'cancel',['reason'=>'Other'],$teacher); $this->fail('Conflicting retry'); }
        catch(BusinessException $e){ $this->assertSame(409,$e->status); }
    }
    public function test_foreign_tenant_staff_is_not_resolved(): void
    {
        [$i,$admin,$staff,$type]=$this->setupHr();
        $b=$this->makeInstitution('hr-foreign');
        $foreign=$this->asTenant($b,fn()=>StaffMember::factory()->create());
        $this->expectException(\Illuminate\Database\Eloquent\ModelNotFoundException::class);
        $this->service()->create($this->input($foreign,$type),$admin);
    }
}

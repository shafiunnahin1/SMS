<?php
namespace Tests\Feature\Hr;

use App\Jobs\SendSmsJob;
use App\Models\{AuditLog, LeaveApplication, StaffAttendance, StaffMember};
use App\Support\Tenancy;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Queue,Storage};

class HrApiTest extends LeaveTestCase
{
    public function test_staff_crud_private_photo_and_tenant_unique_code(): void
    {
        [$i,$admin]=$this->setupHr();$host=$this->hostOf($i);Storage::fake('private');
        $id=$this->api('POST',$host,'hr/staff',$admin,['employee_id'=>'S-NEW','name'=>'New staff','photo'=>UploadedFile::fake()->image('staff.png')])->assertCreated()->json('data.id');
        Tenancy::as($i,function()use($id,$i){
            $photo=StaffMember::findOrFail($id)->photo;
            $this->assertStringStartsWith('institutions/'.$i->id.'/staff/'.$id.'/photo-',$photo);
            Storage::disk('private')->assertExists($photo);
        });
        $this->api('GET',$host,'hr/staff/'.$id,$admin)->assertOk()->assertJsonMissingPath('data.photo');
        $this->api('PUT',$host,'hr/staff/'.$id,$admin,['designation'=>'Assistant'])->assertOk()->assertJsonPath('data.designation','Assistant');
        $this->api('POST',$host,'hr/staff',$admin,['employee_id'=>'S-NEW','name'=>'Duplicate'])->assertUnprocessable();
        $this->api('POST',$host,'hr/staff',$admin,['employee_id'=>'S-X','name'=>'Bad','institution_id'=>999])->assertUnprocessable();
        $this->api('DELETE',$host,'hr/staff/'.$id,$admin)->assertOk();
        $this->api('GET',$host,'hr/staff/'.$id,$admin)->assertNotFound();
        $this->assertDatabaseHas('staff_members',['id'=>$id,'employee_id'=>'S-NEW']);
    }

    public function test_admin_leave_create_approve_balance_and_teacher_own_cancel(): void
    {
        [$i,$admin,$staff,$type]=$this->setupHr();[$teacher]=$this->teacher($i);$host=$this->hostOf($i);
        $id=$this->api('POST',$host,'hr/leaves',$admin,$this->input($staff,$type))->assertCreated()->json('data.id');
        $this->api('PATCH',$host,"hr/leaves/{$id}/approve",$admin)->assertOk()->assertJsonPath('data.status','approved');
        $this->api('PATCH',$host,"hr/leaves/{$id}/approve",$admin)->assertOk();
        $this->api('GET',$host,'hr/leaves/balance?type=staff&id='.$staff->id,$admin)->assertOk()->assertJsonPath('data.0.used',1);
        $own=$this->api('POST',$host,'teacher/leave',$teacher,['leave_type_id'=>$type->id,'from_date'=>'2026-10-21','to_date'=>'2026-10-21'])->assertCreated()->json('data.id');
        $this->api('GET',$host,'teacher/leave',$teacher)->assertOk()->assertJsonCount(1,'data');
        $this->api('PATCH',$host,"hr/leaves/{$own}/approve",$teacher)->assertForbidden();
        $this->api('PATCH',$host,"hr/leaves/{$own}/cancel",$teacher,['reason'=>'Changed'])->assertOk();
        $this->api('PATCH',$host,"hr/leaves/{$own}/cancel",$teacher,['reason'=>'Changed'])->assertOk();
        $this->api('PATCH',$host,"hr/leaves/{$id}/cancel",$teacher,['reason'=>'Foreign person'])->assertNotFound();
        $this->api('POST',$host,'teacher/leave',$teacher,$this->input($staff,$type))->assertForbidden();
        Tenancy::as($i,fn()=>$this->assertSame(1,AuditLog::where('action','leave.approved')->count()));
    }

    public function test_attendance_save_replaces_one_day_and_summary_uses_payee_id(): void
    {
        [$i,$admin,$staff]=$this->setupHr();[$teacher,$profile]=$this->teacher($i);$host=$this->hostOf($i);
        $accountant=$this->makeUser($i,'accountant');
        foreach(['present','late'] as $status) $this->api('POST',$host,'hr/staff-attendance',$accountant,[
            'date'=>'2026-10-20','records'=>[['staff_id'=>$staff->id,'status'=>$status]]])->assertOk();
        $this->api('POST',$host,'teacher-attendance',$admin,['date'=>'2026-10-20','records'=>[['teacher_id'=>$profile->id,'status'=>'present']]])->assertOk();
        $this->api('GET',$host,'hr/staff-attendance?id='.$staff->id.'&month=2026-10',$admin)->assertOk()->assertJsonPath('data.present_days',1)->assertJsonPath('data.late_count',1);
        $this->api('GET',$host,'teacher-attendance?id='.$profile->id.'&month=2026-10',$admin)->assertOk()->assertJsonPath('data.present_days',1);
        Tenancy::as($i,fn()=>$this->assertSame(1,StaffAttendance::count()));
        $this->api('POST',$host,'hr/staff-attendance',$admin,['date'=>'2026-10-20','records'=>[['staff_id'=>$staff->id,'status'=>'leave']]])->assertUnprocessable();
        $this->api('POST',$host,'teacher-attendance',$accountant,['date'=>'2026-10-20','records'=>[['teacher_id'=>$profile->id,'status'=>'present']]])->assertForbidden();
    }

    public function test_foreign_tenant_ids_never_resolve_and_bulk_save_rolls_back(): void
    {
        [$i,$admin,$staff,$type]=$this->setupHr();$b=$this->makeInstitution('hr-api-other');
        $foreign=Tenancy::as($b,fn()=>StaffMember::factory()->create());$host=$this->hostOf($i);
        $this->api('GET',$host,'hr/staff/'.$foreign->id,$admin)->assertNotFound();
        $this->api('POST',$host,'hr/leaves',$admin,$this->input($foreign,$type))->assertNotFound();
        $this->api('POST',$host,'hr/staff-attendance',$admin,['date'=>'2026-10-20','records'=>[
            ['staff_id'=>$staff->id,'status'=>'present'],['staff_id'=>$foreign->id,'status'=>'present']]])->assertNotFound();
        Tenancy::as($i,fn()=>$this->assertSame(0,StaffAttendance::count()));
        $this->api('GET',$host,'hr/staff',$admin)->assertOk()->assertJsonMissing(['id'=>$foreign->id]);
    }

    public function test_role_module_and_invalid_input_gates(): void
    {
        [$i,$admin,$staff,$type]=$this->setupHr();$host=$this->hostOf($i);
        foreach(['teacher','parent','student'] as $role) {
            $user=$this->makeUser($i,$role);
            $this->api('GET',$host,'hr/staff',$user)->assertForbidden();
            $this->api('POST',$host,'hr/leaves',$user,$this->input($staff,$type))->assertForbidden();
        }
        $accountant=$this->makeUser($i,'accountant');
        $this->api('GET',$host,'hr/leave-types',$accountant)->assertForbidden();
        $this->api('POST',$host,'hr/leaves',$admin,$this->input($staff,$type)+['total_days'=>999])->assertUnprocessable();
        $this->api('POST',$host,'hr/leave-types',$admin,['name'=>'New','max_days_per_year'=>5,'is_paid'=>false])->assertCreated();
        $i->update(['enabled_modules'=>['hr_payroll'=>false,'teacher_attendance'=>false]]);
        $this->api('GET',$host,'hr/staff',$admin)->assertForbidden()->assertJsonPath('error','module_disabled');
        $this->api('GET',$host,'teacher-attendance',$admin)->assertForbidden()->assertJsonPath('error','module_disabled');
    }

    public function test_notifications_are_after_commit_localized_and_transition_retries_do_not_duplicate(): void
    {
        [$i,$admin,$staff,$type]=$this->setupHr();[$teacher]=$this->teacher($i);
        $admin->update(['phone'=>'01711111111','locale'=>'en']);$teacher->update(['phone'=>'01811111111','locale'=>'bn']);
        $id=$this->api('POST',$this->hostOf($i),'teacher/leave',$teacher,['leave_type_id'=>$type->id,'from_date'=>'2026-10-20','to_date'=>'2026-10-20'])->assertCreated()->json('data.id');
        $this->api('PATCH',$this->hostOf($i),"hr/leaves/{$id}/approve",$admin)->assertOk();
        $this->api('PATCH',$this->hostOf($i),"hr/leaves/{$id}/approve",$admin)->assertOk();
        Queue::assertPushed(SendSmsJob::class,2);
        Queue::assertPushed(SendSmsJob::class,fn($job)=>$job->phone==='01811111111' && $job->message===__('hr.sms_approved',[],'bn') && $job->afterCommit);
    }
    public function test_staff_linked_user_sms_opt_out_and_clearing_employment_date(): void
    {
        [$i,$admin,$staff,$type]=$this->setupHr();
        $accountant=$this->makeUser($i,'accountant');
        $accountant->update(['notification_preferences'=>['sms'=>false]]);
        Tenancy::as($i,fn()=>$staff->update(['user_id'=>$accountant->id,'phone'=>'01711111111','joining_date'=>'2026-10-20','leaving_date'=>'2026-10-22']));
        $this->api('PUT',$this->hostOf($i),'hr/staff/'.$staff->id,$admin,['joining_date'=>null,'leaving_date'=>null])->assertOk()->assertJsonPath('data.joining_date',null);
        $id=$this->api('POST',$this->hostOf($i),'hr/leaves',$admin,$this->input($staff,$type))->assertCreated()->json('data.id');
        $this->api('PATCH',$this->hostOf($i),"hr/leaves/{$id}/approve",$admin)->assertOk();
        Queue::assertNotPushed(SendSmsJob::class);
    }

    public function test_all_foreign_leave_transition_actions_are_hidden(): void
    {
        [$i,$admin,$staff,$type]=$this->setupHr();
        $b=$this->makeInstitution('hr-foreign-transition');
        $row=Tenancy::as($b,fn()=>LeaveApplication::factory()->create());
        foreach(['approve','reject','cancel'] as $action) $this->api('PATCH',$this->hostOf($i),"hr/leaves/{$row->id}/{$action}",$admin,['reason'=>'No access'])->assertNotFound();
    }

    public function test_approved_leave_cannot_cancel_on_start_day_and_missing_snapshot_fails_closed(): void
    {
        [$i,$admin,$staff,$type]=$this->setupHr();
        $id=$this->api('POST',$this->hostOf($i),'hr/leaves',$admin,$this->input($staff,$type,'2026-10-15','2026-10-15'))->assertCreated()->json('data.id');
        $this->api('PATCH',$this->hostOf($i),"hr/leaves/{$id}/approve",$admin)->assertOk();
        $this->api('PATCH',$this->hostOf($i),"hr/leaves/{$id}/cancel",$admin,['reason'=>'Too late'])->assertConflict();
        $other=Tenancy::as($i,fn()=>LeaveApplication::factory()->create(['staff_id'=>$staff->id,'leave_type_id'=>$type->id,'status'=>'approved']));
        $this->api('GET',$this->hostOf($i),'hr/staff-attendance?id='.$staff->id.'&month=2026-10',$admin)->assertConflict()->assertJsonPath('error','leave_snapshot_missing');
    }

}

<?php
namespace Tests\Feature\Hr;
use App\Models\{AuditLog,Expense,PayrollItem,SalaryAdvance,SalaryPayAccount,StaffAttendance,StaffMember,Teacher,User};
use App\Services\Hr\PayrollPaymentService;

// R3.7 Done When (staff-payroll.md §17): 5 teachers + 2 staff -> regular run (one mid-month increment, one absence, one advance)
// -> review -> approval by a second user -> pay -> slip; numbers follow the §7.3 formulas; no salary number in audit_logs.
class PayrollDoneWhenTest extends PayrollRunTestCase
{
    public function test_school_walk_with_five_teachers_and_two_staff(): void
    {
        [$i,$admin,$firstStaff,$accountant]=$this->payroll();   // staff #1: 20,000 + 40% = 28,000 from 1 Oct
        $payees=[['staff',$firstStaff->id]];
        $secondStaff=StaffMember::factory()->create();$payees[]=['staff',$secondStaff->id];
        for($n=1;$n<=5;$n++){
            $u=User::create(['institution_id'=>$i->id,'name'=>"Teacher $n",'email'=>"walk-$n@example.test",'password'=>'Secret@1234','role'=>'teacher','is_active'=>true]);
            $payees[]=['teacher',Teacher::create(['user_id'=>$u->id,'employee_id'=>"W-$n",'status'=>'active'])->id];
        }
        foreach(array_slice($payees,1) as [$type,$id]){$r=$this->initial($admin,$type,$id);$this->revisionService()->transition($admin,$r->id,'approve');}
        foreach($payees as [$type,$id]) SalaryPayAccount::factory()->create(['payee_type'=>$type,'payee_id'=>$id]);
        // everybody present every working day, except staff #2 absent on 20 Oct
        foreach([$firstStaff->id,$secondStaff->id] as $id) foreach(app(\App\Services\Hr\HrCalendar::class)->dates('2026-10-01','2026-10-31') as $date)
            if(!($id===$secondStaff->id && $date==='2026-10-20')) StaffAttendance::create(['staff_id'=>$id,'date'=>$date,'status'=>'present']);
        foreach(array_slice($payees,2) as [,$id]) foreach(app(\App\Services\Hr\HrCalendar::class)->dates('2026-10-01','2026-10-31') as $date)
            \App\Models\TeacherAttendance::create(['teacher_id'=>$id,'date'=>$date,'status'=>'present']);
        // teacher #1: 10% increment from 15 Oct; teacher #2: active advance 3,000 in one installment
        $raise=$this->increment($admin,'teacher',$payees[2][1]);$this->revisionService()->transition($admin,$raise->id,'approve');
        SalaryAdvance::factory()->create(['payee_type'=>'teacher','payee_id'=>$payees[3][1],'status'=>'active','amount'=>'3000.00','installment_amount'=>'3000.00','installments'=>1,'requested_by'=>$accountant->id]);

        $run=$this->draft($accountant);$this->runs()->transition($accountant,$run->id,'review');
        $approved=$this->runs()->transition($admin,$run->id,'approve');
        $this->assertSame([7,'approved',false],[$approved->payees_count,$approved->status,$approved->self_approved]);
        $net=fn($type,$id)=>PayrollItem::where('run_id',$run->id)->where('payee_type',$type)->where('payee_id',$id)->value('net');
        $this->assertSame('28000.00',$net('staff',$firstStaff->id),'full month, no deduction');
        $this->assertSame('27096.77',$net('staff',$secondStaff->id),'28,000 - 28,000/31 x 1');
        $this->assertSame('29535.48',$net('teacher',$payees[2][1]),'28,000 x 14/31 + 30,800 x 17/31 = 12,645.16 + 16,890.32');
        $this->assertSame('25000.00',$net('teacher',$payees[3][1]),'28,000 - advance 3,000');

        $paid=app(PayrollPaymentService::class)->pay($accountant,$run->id,['reference'=>'OCT']);
        $this->assertSame('paid',$paid->status);
        $this->assertSame('closed',SalaryAdvance::where('payee_id',$payees[3][1])->value('status'));
        $this->assertSame($paid->total_net,\App\Support\Money::format(\App\Support\Money::toPaisa((string)Expense::where('payroll_run_id',$run->id)->sum('amount'))));
        $this->assertStringStartsWith('%PDF-',app(\App\Services\Hr\PayslipService::class)->render($admin,$paid->items->first()->id));
        $audit=json_encode(AuditLog::pluck('new_data'));
        foreach(['28000','27096.77','29535.48','20000.00'] as $amount) $this->assertStringNotContainsString($amount,$audit,'no salary number in audit_logs');
    }
}

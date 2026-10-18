<?php
namespace Tests\Feature\Accounting;
use App\Models\Voucher;
use Illuminate\Database\UniqueConstraintViolationException;

// accounting.md §1.3/§7: one automatic voucher per source record, guaranteed by the database unique key
class AutoPostingIdempotentTest extends PostingDayTestCase
{
    public function test_posting_the_same_fee_expense_and_payroll_twice_keeps_one_voucher(): void
    {
        [$a,,,,$utility,$run]=$this->day();
        foreach([$a,$utility,$run] as [$source,$id]){
            $first=$this->posting()->post($source,$id);$second=$this->posting()->post($source,$id);
            $this->assertSame($first->id,$second->id);
        }
        $this->posting()->repost('2026-10-01','2026-10-31');$this->posting()->repost('2026-10-01','2026-10-31');
        $this->assertSame(7,Voucher::count());
        $this->assertSame([],$this->posting()->unposted());
        $this->expectException(UniqueConstraintViolationException::class);
        $copy=Voucher::where('source','fee')->first()->replicate(['voucher_no']);$copy->voucher_no='RV-2026-99999';$copy->status='draft';$copy->save();
    }

    public function test_job_runs_inside_its_tenant_and_a_locked_period_leaves_the_source_unposted(): void
    {
        $this->assertContains(\App\Traits\TenantAwareJob::class,class_uses(\App\Jobs\PostAccountingVoucher::class));
        $this->settings(['locked_until'=>'2026-10-20']);
        [$a]=$this->day();
        (new \App\Jobs\PostAccountingVoucher('fee',$a[1],$this->i->id))->handle($this->posting());
        $this->assertSame(0,Voucher::count());
        $this->assertContains(['source'=>'fee','source_id'=>$a[1],'date'=>'2026-10-15'],$this->posting()->unposted());
        $this->settings(['locked_until'=>null]);
        $this->assertSame(7,$this->posting()->repost('2026-10-01','2026-10-31')['posted']);
    }
}

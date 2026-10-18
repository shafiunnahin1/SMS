<?php
namespace Tests\Feature\Accounting;
use App\Models\{Expense,FeeCategory,FeePayment,FeeRefund,InventoryItem,PayrollItem,PayrollRun,Student};
use App\Services\Accounting\AccountingPostingService;
use App\Support\Tenancy;

// The refs_r12.py ledger day (minus the donation, which is R3.11), built from the real source rows each module writes
abstract class PostingDayTestCase extends AccountingTestCase
{
    protected function posting(): AccountingPostingService { return app(AccountingPostingService::class); }

    protected function fee(string $amount, string $method, int $n): FeePayment
    {
        $student=Student::first()??Student::create(['student_id'=>'ACC-1','guardian_phone'=>'01711111111']);
        $category=FeeCategory::first()??FeeCategory::create(['name'=>'Tuition','amount'=>'100.00','frequency'=>'monthly']);
        return FeePayment::create(['student_id'=>$student->id,'fee_category_id'=>$category->id,'amount'=>$amount,'paid_amount'=>$amount,
            'receipt_no'=>'RCP-'.$n,'line_no'=>1,'payment_method'=>$method,'paid_at'=>'2026-10-15 10:00:00']);
    }

    /** returns [the sources as [source, id]] for the day */
    protected function day(): array
    {
        $this->settings(['expense_map'=>['utilities'=>'5200']]);
        $a=$this->fee('12000.00','cash',1); $b=$this->fee('1500.00','cash',2); $bk=$this->fee('4000.00','bkash',3);
        $refund=FeeRefund::create(['student_id'=>$a->student_id,'request_key'=>'k-1','revision'=>3,'original_receipt_no'=>'RCP-1','amount'=>'500.00',
            'refund_lines'=>[['fee_payment_id'=>$a->id,'amount'=>'500.00']],'reason'=>'over-collected','method'=>'cash','status'=>'processed',
            'requested_by'=>$this->admin->id,'approved_by'=>$this->admin->id,'processed_by'=>$this->admin->id,'processed_at'=>'2026-10-15 11:00:00']);
        Expense::create(['category'=>'refund','title'=>'Refund','amount'=>'500.00','expense_date'=>'2026-10-15','payment_method'=>'cash','source'=>'refund','added_by'=>$this->admin->id]);
        $utility=Expense::create(['category'=>'utilities','title'=>'Electricity','amount'=>'3000.00','expense_date'=>'2026-10-15','payment_method'=>'cash','source'=>'manual','added_by'=>$this->admin->id]);
        // payroll paid in cash: net 8,000 after PF 1,000 and advance recovery 500 (5100 = 9,500)
        $run=PayrollRun::create(['month'=>'2026-10','kind'=>'regular','label'=>'acc','status'=>'draft','settings_snapshot'=>[],'prepared_by'=>$this->admin->id]);
        PayrollItem::create(['run_id'=>$run->id,'payee_type'=>'staff','payee_id'=>1,'days_in_month'=>31,'basic'=>'9500.00','gross'=>'9500.00','total_earnings'=>'9500.00',
            'total_deductions'=>'1500.00','net'=>'8000.00','status'=>'paid','payment_method'=>'cash','breakdown'=>[
                ['code'=>'basic','type'=>'earning','amount'=>'9500.00','source'=>'structure','ref_id'=>null],
                ['code'=>'pf_employee','type'=>'deduction','amount'=>'1000.00','source'=>'pf','ref_id'=>null],
                ['code'=>'advance_recovery','type'=>'deduction','amount'=>'500.00','source'=>'advance','ref_id'=>1]]]);
        $run->fill(['status'=>'paid','paid_at'=>'2026-10-15 12:00:00'])->save();
        Expense::create(['category'=>'salary','title'=>'Payroll','amount'=>'8000.00','expense_date'=>'2026-10-15','payment_method'=>'cash','source'=>'payroll','payroll_run_id'=>$run->id,'added_by'=>$this->admin->id]);
        // store: 2 books bought at 780, sold at 1,200 each (COGS 1,560)
        $host=$this->hostOf($this->i);
        $item=$this->api('POST',$host,'inventory/items',$this->admin,['code'=>'BK-1','name'=>'Book','sale_price'=>'1200.00','reorder_level'=>'1','is_sellable'=>true])->json('data.id');
        $this->api('POST',$host,'inventory/receive',$this->admin,['item_id'=>$item,'qty'=>'2','unit_amount'=>'780'])->assertCreated();
        $sale=$this->api('POST',$host,'inventory/sale',$this->admin,['item_id'=>$item,'qty'=>'2'])->assertCreated()->json('data.id');
        $this->bindTenant($this->i->fresh());
        return [['fee',$a->id],['fee',$b->id],['fee',$bk->id],['refund',$refund->id],['expense',$utility->id],['payroll',$run->id],['store',$sale]];
    }
}

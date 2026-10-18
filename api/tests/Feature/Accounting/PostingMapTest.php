<?php
namespace Tests\Feature\Accounting;
use App\Models\{LedgerAccount,Voucher};

// accounting.md §3/§7: each source posts exactly the lines of the posting table
class PostingMapTest extends PostingDayTestCase
{
    private function lines(string $source, int $id): array
    {
        $v=Voucher::where('source',$source)->where('source_id',$id)->with('lines')->sole();
        $codes=LedgerAccount::pluck('code','id');
        return $v->lines->map(fn($l)=>[$codes[$l->account_id],$l->debit,$l->credit])->sortBy(fn($r)=>$r[0])->values()->all();
    }

    public function test_every_source_posts_its_mapped_lines(): void
    {
        [$a,$b,$bk,$refund,$utility,$run,$sale]=$this->day();
        $this->posting()->repost('2026-10-01','2026-10-31');
        $cat=\App\Models\FeeCategory::value('id');
        $this->assertSame([['1100','12000.00','0.00'],["4110.$cat",'0.00','12000.00']],$this->lines(...$a));
        $this->assertSame([['1300','4000.00','0.00'],["4110.$cat",'0.00','4000.00']],$this->lines(...$bk),'bKash -> 1300, not 1100');
        $this->assertSame([['1100','0.00','500.00'],["4110.$cat",'500.00','0.00']],$this->lines(...$refund));
        $this->assertSame([['1100','0.00','3000.00'],['5200','3000.00','0.00']],$this->lines(...$utility),'expense_map utilities -> 5200');
        $this->assertSame([['1100','0.00','8000.00'],['1400','0.00','500.00'],['2100','0.00','1000.00'],['5100','9500.00','0.00']],$this->lines(...$run));
        $this->assertSame([['1100','2400.00','0.00'],['1500','0.00','1560.00'],['4400','0.00','2400.00'],['5700','1560.00','0.00']],$this->lines(...$sale));
        $this->assertSame(0,Voucher::where('source','expense')->whereIn('source_id',\App\Models\Expense::whereIn('source',['refund','payroll'])->pluck('id'))->count(),
            'refund and payroll expense rows are not posted twice');
    }

    public function test_unmapped_expense_category_goes_to_5900_and_a_correction_swaps_sides(): void
    {
        $e=\App\Models\Expense::create(['category'=>'misc','title'=>'Misc','amount'=>'-50.00','expense_date'=>'2026-10-15','payment_method'=>'bank','source'=>'manual','added_by'=>$this->admin->id]);
        $this->posting()->post('expense',$e->id);
        $this->assertSame([['1200','50.00','0.00'],['5900','0.00','50.00']],$this->lines('expense',$e->id));
    }
}

<?php
namespace Tests\Feature\Hr;
use App\Services\Hr\AdvanceRecoveryCalculator;
class AdvanceRecoveryTest extends LeaveTestCase
{
    public function test_exact_normal_recovery_minimum_net_balance_cap_skip_and_final_remainder(): void
    {
        $c=app(AdvanceRecoveryCalculator::class);
        $this->assertSame(['recovery'=>'5000.00','remaining'=>'10000.00','net'=>'25500.00'],$c->calculate('15000.00','0.00','5000.00','30500.00'));
        $this->assertSame(['recovery'=>'500.00','remaining'=>'14500.00','net'=>'1000.00'],$c->calculate('15000.00','0.00','5000.00','1500.00','1000.00'));
        $this->assertSame('0.00',$c->calculate('15000.00','0.00','5000.00','-10.00')['recovery']);
        $this->assertSame('100.01',$c->calculate('10000.01','9900.00','5000.00','30500.00')['recovery']);
        $this->assertSame('0.00',$c->calculate('10000.00','0.00','5000.00','30500.00','0.00',true)['recovery']);
        $this->assertSame('3333.34',$c->calculate('10000.00','6666.66','3333.33','30500.00','0.00',false,true)['recovery']);
        $this->assertSame('0.01',$c->calculate('0.01','0.00','0.00','1.00','0.00',false,true)['recovery']);
    }
    public function test_invalid_over_recovery_is_rejected(): void
    {
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        app(AdvanceRecoveryCalculator::class)->calculate('100.00','100.01','10.00','1000.00');
    }
}

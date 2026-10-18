<?php
namespace Tests\Feature\Hr;
use App\Models\SalaryComponent;
use Illuminate\Validation\ValidationException;

// staff-payroll.md §10/§17: tax is off by default; when on, every rate comes from the institution's settings (nothing in code);
// slab = simplified (taxable x 12 - annual exemption, banded, / 12).
class TaxModeTest extends PayrollRunTestCase
{
    private function withTax(?array $tax): array
    {
        [$i,$admin,$staff,$accountant]=$this->payroll();
        SalaryComponent::where('code','house_rent')->update(['taxable'=>true]);
        if($tax!==null){$i->forceFill(['settings'=>['payroll'=>['tax'=>$tax]]])->save();$this->bindTenant($i->fresh());}
        return [$i,$admin,$staff,$accountant];
    }

    private function tax($accountant): ?string
    {
        $item=$this->draft($accountant)->items->first();
        return collect($item->breakdown)->firstWhere('source','tax')['amount']??null;
    }

    public function test_default_is_off_and_deducts_nothing(): void
    {
        [,,,$accountant]=$this->withTax(null);
        $item=$this->draft($accountant)->items->first();
        $this->assertSame(['0.00',null],[$item->tax,collect($item->breakdown)->firstWhere('source','tax')]);
    }

    public function test_fixed_percent_uses_the_configured_rate_on_taxable_income(): void
    {
        [,,,$accountant]=$this->withTax(['mode'=>'fixed_percent','percent'=>'2.5']);
        $this->assertSame('700.00',$this->tax($accountant),'2.5% of taxable 28,000');
    }

    public function test_slab_is_annualised_banded_and_monthly(): void
    {
        // taxable 28,000 x 12 = 336,000 - exemption 300,000 = 36,000: 20,000 at 5% + 16,000 at 10% = 2,600 / 12 = 216.67
        [,,,$accountant]=$this->withTax(['mode'=>'slab','annual_exemption'=>'300000','slabs'=>[['up_to'=>'20000','rate'=>'5'],['up_to'=>null,'rate'=>'10']]]);
        $this->assertSame('216.67',$this->tax($accountant));
    }

    public function test_non_taxable_components_are_left_out(): void
    {
        [,,,$accountant]=$this->withTax(['mode'=>'fixed_percent','percent'=>'10']);
        SalaryComponent::where('code','house_rent')->update(['taxable'=>false]);
        $this->assertSame('2000.00',$this->tax($accountant),'10% of basic 20,000 only');
    }

    public function test_malformed_tax_settings_fail_closed(): void
    {
        [,,,$accountant]=$this->withTax(['mode'=>'slab','slabs'=>[['up_to'=>'50000','rate'=>'5'],['up_to'=>'10000','rate'=>'10']]]);
        $this->expectException(ValidationException::class);
        $this->draft($accountant);
    }
}

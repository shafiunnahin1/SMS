<?php
namespace App\Services\Hr;
use App\Support\Money;
use Illuminate\Validation\ValidationException;
/** Pure reviewed recovery arithmetic; does not write advances or imply payroll settlement. */
class AdvanceRecoveryCalculator
{
    public function __construct(private SalaryCalculator $money) {}
    public function calculate(string $principal,string $recovered,string $installment,string $netBefore,string $minimum='0.00',bool $skip=false,bool $final=false): array
    {
        $total=$this->money->paisa($principal);$paid=$this->money->paisa($recovered);$part=$this->money->paisa($installment);$min=$this->money->paisa($minimum);
        if($paid>$total || !preg_match('/^-?\d{1,8}(?:\.\d{1,2})?$/D',$netBefore)) throw ValidationException::withMessages(['recovery'=>__('salary.invalid')]);
        $net=Money::toPaisa($netBefore);$remaining=$total-$paid;$capacity=max(0,$net-$min);
        $take=$skip?0:min($remaining,$final?$remaining:$part,$capacity);
        return ['recovery'=>Money::format($take),'remaining'=>Money::format($remaining-$take),'net'=>Money::format($net-$take)];
    }
}

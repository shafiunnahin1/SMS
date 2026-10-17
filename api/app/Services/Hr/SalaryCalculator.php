<?php

namespace App\Services\Hr;

use App\Models\SalaryComponent;
use App\Support\Money;
use Illuminate\Validation\ValidationException;

class SalaryCalculator
{
    public const MAX_PAISA = 9999999999;

    public function paisa(mixed $value, string $field = 'value'): int
    {
        if ((!is_string($value) && !is_int($value)) || !preg_match('/^\\d{1,8}(\\.\\d{1,2})?$/D',(string)$value)) $this->invalid($field);
        return Money::toPaisa($value);
    }

    private function invalid(string $field): never
    {
        throw ValidationException::withMessages([$field=>__('salary.invalid')]);
    }

    /** Reviewed lines include exact inputs, computed amounts and the definition used. No floats. */
    public function calculate(mixed $basic, array $lines): array
    {
        $basic = $this->paisa($basic,'basic');
        $gross = $basic; $out = []; $seen = [];
        foreach ($lines as $line) {
            if (!is_array($line) || !isset($line['component_id']) || !filter_var($line['component_id'],FILTER_VALIDATE_INT) || (int)$line['component_id']<1) $this->invalid('lines');
            $id=(int)$line['component_id'];
            if(isset($seen[$id])) $this->invalid('lines'); $seen[$id]=true;
            $component=SalaryComponent::findOrFail($id);
            if(!$component->is_active || !in_array($component->type,['earning','deduction'],true)) $this->invalid('lines');
            $mode=$line['mode']??$component->calc;
            if(!in_array($mode,['fixed','percent_basic'],true)) $this->invalid('lines');
            $value=$this->paisa($line['value']??null,'lines');
            if($mode==='percent_basic') {
                // Bound the product before multiplication, including Money::ratio's doubled numerator.
                if($basic>0 && $value>intdiv(self::MAX_PAISA*10000,$basic)) $this->invalid('lines');
                $amount=Money::ratio($basic,$value,10000);
            } else $amount=$value;
            if($amount>self::MAX_PAISA) $this->invalid('lines');
            if($component->type==='earning') $gross+=$amount;
            if($gross>self::MAX_PAISA) $this->invalid('gross');
            $out[]=['component_id'=>$id,'mode'=>$mode,'value'=>Money::format($value),'amount'=>Money::format($amount),
                'component'=>['id'=>$component->id,'code'=>$component->code,'name'=>$component->name,'type'=>$component->type,
                    'calc'=>$component->calc,'taxable'=>$component->taxable,'is_pf'=>$component->is_pf,
                    'is_system'=>$component->is_system,'is_active'=>$component->is_active]];
        }
        usort($out,fn($a,$b)=>$a['component_id']<=>$b['component_id']);
        return ['basic'=>Money::format($basic),'gross'=>Money::format($gross),'lines'=>$out];
    }
}

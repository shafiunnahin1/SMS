<?php

namespace App\Http\Requests\QuestionBank;

use App\Support\Money;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

// POST /super/qb/price-rules (and its preview), QB.6 (D66, question-bank.md §4.3): one free / partly-free / discount rule. The
// value's meaning depends on the method: none (free, free_for_class_level), a whole count N (first_n_*, free_first_n_per_buyer),
// a percent 0-100 (percent_off) or taka (amount_off, fixed_price).
class QbPriceRuleRequest extends FormRequest
{
    public const COUNT = ['first_n_items_free', 'first_n_pages_free', 'free_first_n_per_buyer'];
    public const TAKA = ['percent_off', 'amount_off', 'fixed_price'];

    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'target_type' => ['required', 'in:item,question_type,topic,chapter,subject,class_level,resource_kind,quiz_package,all'],
            'target_ref'  => ['nullable', 'string', 'max:100', 'regex:/^((question|concept|resource|quiz_package):\d+|\d+|slide|book|pdf)$/'],
            'audience'    => ['required', 'in:institution,student,both'],
            'method'      => ['required', 'in:free,first_n_items_free,first_n_pages_free,percent_off,amount_off,fixed_price,free_for_class_level,free_first_n_per_buyer'],
            'value'       => ['nullable', 'regex:/^\d{1,8}(\.\d{1,2})?$/'],
            'priority'    => ['sometimes', 'integer', 'min:-1000', 'max:1000'],
            'starts_at'   => ['nullable', 'date'],
            'ends_at'     => ['nullable', 'date', 'after:starts_at'],
            'note'        => ['nullable', 'string', 'max:250'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $v) {
            $m = $this->input('method');
            $type = $this->input('target_type');
            $ref = (string) $this->input('target_ref');
            $value = $this->input('value');
            if ($type === 'all' && $ref !== '') $v->errors()->add('target_ref', __('errors.qb_rule_target'));
            if ($type !== 'all' && $ref === '') $v->errors()->add('target_ref', __('errors.qb_rule_target'));
            if ($type === 'item' && !preg_match('/^(question|concept|resource|quiz_package):\d+$/', $ref)) $v->errors()->add('target_ref', __('errors.qb_rule_target'));
            if ($type === 'resource_kind' && !in_array($ref, ['slide', 'book', 'pdf'], true)) $v->errors()->add('target_ref', __('errors.qb_rule_target'));
            if (!in_array($type, ['item', 'resource_kind', 'all'], true) && !ctype_digit($ref)) $v->errors()->add('target_ref', __('errors.qb_rule_target'));
            if ($m === 'free_for_class_level' && $type !== 'class_level') $v->errors()->add('target_type', __('errors.qb_rule_class_only'));
            if (in_array($m, ['free', 'free_for_class_level'], true) && $value !== null && $value !== '') $v->errors()->add('value', __('errors.qb_rule_value'));
            if (in_array($m, self::COUNT, true) && (!ctype_digit((string) $value) || (int) $value < 1)) $v->errors()->add('value', __('errors.qb_rule_value'));
            if (in_array($m, self::TAKA, true) && ($value === null || $value === '')) $v->errors()->add('value', __('errors.qb_rule_value'));
            if ($m === 'percent_off' && preg_match('/^\d{1,8}(\.\d{1,2})?$/', (string) $value) && Money::toPaisa((string) $value) > 10000) $v->errors()->add('value', __('errors.qb_rule_value'));
        }];
    }
}

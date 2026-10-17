<?php

namespace App\Http\Requests\Inventory;

use Illuminate\Foundation\Http\FormRequest;

class InventoryReportRequest extends FormRequest
{
    public function rules(): array
    {
        return ['from' => ['sometimes', 'date_format:Y-m-d'], 'to' => ['sometimes', 'date_format:Y-m-d', 'after_or_equal:from'],
            'format' => ['sometimes', 'in:json,pdf,xlsx'], 'low' => ['sometimes', 'boolean']];
    }
}

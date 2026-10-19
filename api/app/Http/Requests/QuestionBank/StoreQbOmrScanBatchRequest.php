<?php

namespace App\Http\Requests\QuestionBank;

use Illuminate\Foundation\Http\FormRequest;

class StoreQbOmrScanBatchRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, ['admin', 'teacher'], true);
    }

    public function rules(): array
    {
        return [
            'scans' => ['sometimes', 'array', 'min:1', 'max:200'],
        ];
    }
}
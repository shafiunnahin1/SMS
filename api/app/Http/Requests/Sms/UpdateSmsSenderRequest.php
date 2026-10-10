<?php

namespace App\Http\Requests\Sms;

use Illuminate\Foundation\Http\FormRequest;

// D59: the two switches, the institution's own masking sender and its BulkSMSBD key (write-only; empty = keep the stored one)
class UpdateSmsSenderRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'universal_enabled' => ['sometimes', 'boolean'],
            'own_enabled'       => ['sometimes', 'boolean'],
            'sender_id'         => ['sometimes', 'nullable', 'string', 'max:20', 'regex:/^[A-Za-z0-9 ._-]+$/'],
            'api_key'           => ['sometimes', 'nullable', 'string', 'min:8', 'max:200'],
        ];
    }
}

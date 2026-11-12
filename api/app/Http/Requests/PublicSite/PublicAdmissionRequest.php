<?php

namespace App\Http\Requests\PublicSite;

use Illuminate\Foundation\Http\FormRequest;

// D202 PUB.2 (docs/modules/public-website.md "Admission form fields"). Program / batch ids are checked in the controller against
// THIS institution's public programs and open batches (a foreign or hidden id is ignored, not an error). Any other field is ignored.
class PublicAdmissionRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    protected function prepareForValidation(): void
    {
        foreach (['name', 'guardian_name', 'current_class', 'message'] as $k) {
            if (is_string($this->input($k))) $this->merge([$k => trim(strip_tags($this->input($k)))]);
        }
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:100',
            'guardian_name' => 'nullable|string|max:100',
            'phone' => ['required', 'string', 'regex:/^(?:\+?88)?01[3-9]\d{8}$/'],
            'email' => 'nullable|email|max:100',
            'current_class' => 'nullable|string|max:100',
            'interested_program_id' => 'nullable|integer|min:1',
            'interested_batch_id' => 'nullable|integer|min:1',
            'message' => 'nullable|string|max:500',
            'consent' => 'accepted',
            'website' => 'nullable',                              // honeypot: people never see it
        ];
    }
}

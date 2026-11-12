<?php

namespace App\Http\Requests\Notices;

use App\Support\Tenancy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// D193 NTC.1: a notice; program/batch must be this institution's (a batch of the chosen program), both empty = everyone
class NoticeRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $tenant = Tenancy::current()->id;
        $creating = $this->isMethod('post');
        $req = $creating ? 'required' : 'sometimes';
        return [
            'title'        => [$req, 'string', 'max:150'],
            'content'      => [$req, 'string', 'max:10000'],
            'target'       => [$req, Rule::in(['all', 'students', 'teachers', 'parents'])],
            'program_id'   => ['nullable', 'integer', Rule::exists('programs', 'id')->where('institution_id', $tenant)],
            'batch_id'     => ['nullable', 'integer', Rule::exists('batches', 'id')->where('institution_id', $tenant)->where('program_id', (int) $this->input('program_id'))],
            'published_at' => ['nullable', 'date'],
            'require_ack'  => ['sometimes', 'boolean'],
            'is_public'    => ['sometimes', 'boolean'],                 // D202 PUB.2: also shown on the public website
            'ack_deadline' => ['nullable', 'date', 'required_if:require_ack,true,1'],
            'created_by'   => ['prohibited'],
        ];
    }
}

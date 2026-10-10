<?php

namespace App\Http\Requests\Academic;

use Illuminate\Foundation\Http\FormRequest;

// POST /programs, PUT /programs/{id} (docs/modules/academic-structure.md). A school "Class", a coaching "Course" - the word comes
// from the institution's terms; the row is the same. is_default is never set from the client (the private-batch "General").
class ProgramRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $req = $this->isMethod('post') ? 'required' : 'sometimes';
        return [
            'name'               => "{$req}|string|max:100",
            'numeric_name'       => 'nullable|integer|min:1|max:20',
            'code'               => 'nullable|string|max:20',
            'group_name'         => 'nullable|in:science,humanities,business,general',
            'duration_months'    => 'nullable|integer|min:1|max:120',
            'course_fee'         => 'nullable|numeric|min:0|max:9999999',
            'is_active'          => 'sometimes|boolean',
            'sort_order'         => 'sometimes|integer|min:0|max:9999',
        ];
    }
}

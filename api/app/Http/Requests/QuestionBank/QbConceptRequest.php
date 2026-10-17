<?php

namespace App\Http\Requests\QuestionBank;

use Illuminate\Foundation\Http\FormRequest;

// POST /writer/concepts, PUT /writer/concepts/{id} (QB.5, D65 §3গ): a topic's concept - a title and a body (text with $...$ maths,
// the rich editor's JSON) and its pictures. The status never comes from the client (submit / publish / reject move it).
class QbConceptRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $req = $this->isMethod('post') ? 'required' : 'sometimes';
        return [
            'qb_topic_id' => [$req, 'integer', 'exists:qb_topics,id'],
            'title_bn'    => [$req, 'string', 'max:250'],
            'title_en'    => ['nullable', 'string', 'max:250'],
            'body_text'   => [$req, 'string', 'max:100000'],
            'body_json'   => ['nullable', 'array'],
            'sort_order'  => ['sometimes', 'integer', 'min:0', 'max:10000'],
            'media_ids'   => ['sometimes', 'array', 'max:20'],                      // pictures uploaded through POST /writer/media
            'media_ids.*' => ['integer', 'distinct', 'exists:qb_media,id'],
            'status'      => ['prohibited'],
        ];
    }
}

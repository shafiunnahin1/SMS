<?php

namespace App\Http\Requests\QuestionBank;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// POST /writer/questions, PUT /writer/questions/{id} (QB.2, D65 §3খ): the core of a question. Options, creative parts and the rich
// editor's JSON grow in QB.3/QB.4; the status never comes from the client (submit / publish / reject move it).
class QbQuestionRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $req = $this->isMethod('post') ? 'required' : 'sometimes';
        return [
            'qb_question_type_id' => [$req, 'integer', Rule::exists('qb_question_types', 'id')->where('is_active', 1)],
            'qb_subject_id'       => [$req, 'integer', 'exists:qb_subjects,id'],
            'qb_chapter_id'       => ['nullable', 'integer', 'exists:qb_chapters,id'],
            'qb_topic_id'         => ['nullable', 'integer', 'exists:qb_topics,id'],
            'difficulty'          => ['sometimes', 'integer', 'min:1', 'max:5'],
            'marks'               => ['sometimes', 'numeric', 'regex:/^\d{1,3}(\.\d{1,2})?$/', 'min:0.25', 'max:100'],
            'language'            => ['sometimes', 'in:bn,en'],
            'content_mode'        => ['sometimes', 'in:plain_text,rich_math,mixed'],
            'question_text'       => [$req, 'string', 'max:20000'],
            'answer_text'         => ['nullable', 'string', 'max:20000'],
            'explanation_text'    => ['nullable', 'string', 'max:20000'],
            'question_json'       => ['nullable', 'array'],
            'answer_json'         => ['nullable', 'array'],
            'explanation_json'    => ['nullable', 'array'],
            'class_level_ids'     => ['sometimes', 'array', 'max:30'],
            'class_level_ids.*'   => ['integer', 'distinct', 'exists:qb_class_levels,id'],
            'status'              => ['prohibited'],
        ];
    }
}

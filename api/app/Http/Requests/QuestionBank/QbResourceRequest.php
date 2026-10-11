<?php

namespace App\Http\Requests\QuestionBank;

use Illuminate\Foundation\Http\FormRequest;

// POST /writer/resources, PUT /writer/resources/{id} (QB.5, D65 §3গ): a slide, book or PDF - always a PDF file uploaded through
// POST /writer/resource-files - filed under exactly one of subject / chapter / topic, with its page count and up to ten preview
// pages (pictures uploaded through POST /writer/media). The status never comes from the client.
class QbResourceRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $req = $this->isMethod('post') ? 'required' : 'sometimes';
        return [
            'kind'          => [$req, 'in:slide,book,pdf'],
            'title_bn'      => [$req, 'string', 'max:250'],
            'title_en'      => ['nullable', 'string', 'max:250'],
            'qb_subject_id' => ['nullable', 'integer', 'exists:qb_subjects,id'],
            'qb_chapter_id' => ['nullable', 'integer', 'exists:qb_chapters,id'],
            'qb_topic_id'   => ['nullable', 'integer', 'exists:qb_topics,id'],
            'qb_media_id'   => [$req, 'integer', 'exists:qb_media,id'],
            'page_count'    => [$req, 'integer', 'min:1', 'max:5000'],
            'preview_media_ids'   => ['sometimes', 'array', 'max:10'],
            'preview_media_ids.*' => ['integer', 'distinct', 'exists:qb_media,id'],
            'status'        => ['prohibited'],
        ];
    }
}

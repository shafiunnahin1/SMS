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
            // QB.3: the parts of the core types. A list present in the request REPLACES the stored one; absent = unchanged.
            'options'                      => ['sometimes', 'array', 'max:8'],                       // mcq, true_false
            'options.*.label'              => ['required', 'string', 'max:10'],
            'options.*.content_text'       => ['required', 'string', 'max:2000'],
            'options.*.content_json'       => ['nullable', 'array'],
            'options.*.is_correct'         => ['required', 'boolean'],
            'creative_parts'               => ['sometimes', 'array', 'max:4'],                       // creative: উদ্দীপক = question_text, then ক-ঘ
            'creative_parts.*.part_label'  => ['required', 'string', 'max:10', 'distinct'],
            'creative_parts.*.cognitive_level' => ['required', 'in:knowledge,understanding,application,higher_order'],
            'creative_parts.*.marks'       => ['required', 'numeric', 'regex:/^\d{1,2}(\.\d{1,2})?$/', 'min:0.5', 'max:20'],
            'creative_parts.*.question_text' => ['required', 'string', 'max:5000'],
            'creative_parts.*.question_json' => ['nullable', 'array'],
            'creative_parts.*.answer_text' => ['nullable', 'string', 'max:20000'],
            'creative_parts.*.answer_json' => ['nullable', 'array'],
            'occurrences'                  => ['sometimes', 'array', 'max:20'],                      // where the question appeared before
            'occurrences.*.board'          => ['nullable', 'string', 'max:50'],
            'occurrences.*.institution_name' => ['nullable', 'string', 'max:200'],
            'occurrences.*.exam_type'      => ['nullable', 'string', 'max:50'],
            'occurrences.*.year'           => ['nullable', 'integer', 'min:1950', 'max:2100'],
            'occurrences.*.note'           => ['nullable', 'string', 'max:200'],
            'media_ids'                    => ['sometimes', 'array', 'max:10'],                      // pictures uploaded through POST /writer/media
            'media_ids.*'                  => ['integer', 'distinct', 'exists:qb_media,id'],
            // QB.4: the structured types - a passage / word box (stimuli) and the gaps, pairs, steps or sub-questions (items).
            // An item names its stimulus by its index in `stimuli`; answer_json is never sent without an unlock.
            'stimuli'                      => ['sometimes', 'array', 'max:5'],
            'stimuli.*.label'              => ['nullable', 'string', 'max:50'],
            'stimuli.*.content_text'       => ['nullable', 'string', 'max:20000'],
            'stimuli.*.content_json'       => ['nullable', 'array'],
            'items'                        => ['sometimes', 'array', 'max:40'],
            'items.*.item_type'            => ['required', 'in:gap,match_pair,order_step,sub_question,sub_mcq,true_false,table_fill,match_triple,multi_field'],   // D73: mixed, four new kinds
            'items.*.stimulus_index'       => ['nullable', 'integer', 'min:0', 'max:4'],
            'items.*.prompt_text'          => ['nullable', 'string', 'max:5000'],
            'items.*.prompt_json'          => ['nullable', 'array'],
            'items.*.answer_json'          => ['nullable', 'array'],
            'items.*.marks'                => ['nullable', 'numeric', 'min:0', 'max:100'],
            'status'              => ['prohibited'],
        ];
    }
}

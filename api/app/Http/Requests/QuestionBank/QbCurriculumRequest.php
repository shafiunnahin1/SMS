<?php

namespace App\Http\Requests\QuestionBank;

use App\Http\Controllers\QuestionBank\QbCurriculumController;
use App\Models\QbCurriculumVersion;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// POST /super/qb/{kind}, PUT /super/qb/{kind}/{id} (QB.1, docs/modules/question-bank.md §3ক): one node of the platform curriculum.
// D65 legacy curriculum kinds plus the D138/D139 versioned language curriculum kinds.
class QbCurriculumRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $req = $this->isMethod('post') ? 'required' : 'sometimes';
        $names = ['name_bn' => "{$req}|string|max:200", 'name_en' => "{$req}|string|max:200", 'sort_order' => 'sometimes|integer|min:0|max:9999'];
        $classes = ['class_level_ids' => 'sometimes|array|max:30', 'class_level_ids.*' => 'integer|distinct|exists:qb_class_levels,id'];
        return match ($this->route('kind')) {
            'class-levels' => ['name_bn' => "{$req}|string|max:100", 'name_en' => "{$req}|string|max:100",
                'education_level' => 'sometimes|in:' . implode(',', QbCurriculumController::EDUCATION_LEVELS),
                'sort_order' => 'sometimes|integer|min:0|max:9999', 'is_active' => 'sometimes|boolean'],
            'subjects' => ['name_bn' => "{$req}|string|max:150", 'name_en' => "{$req}|string|max:150", 'code' => 'nullable|string|max:30',
                'sort_order' => 'sometimes|integer|min:0|max:9999', 'is_active' => 'sometimes|boolean'] + $classes,
            'chapters' => $names + ['qb_subject_id' => $this->isMethod('post') ? 'required|integer|exists:qb_subjects,id' : 'prohibited',
                'number' => 'nullable|integer|min:1|max:999'] + $classes,
            'topics' => $names + ['qb_chapter_id' => $this->isMethod('post') ? 'required|integer|exists:qb_chapters,id' : 'prohibited'],
            'curriculum-versions' => [
                'qb_subject_id' => $this->isMethod('post') ? 'required|integer|exists:qb_subjects,id' : 'prohibited',
                'version_key' => [$req, 'string', 'max:64', Rule::unique('qb_curriculum_versions', 'version_key')
                    ->where('qb_subject_id', $this->input('qb_subject_id', QbCurriculumVersion::find($this->route('id'))?->qb_subject_id))
                    ->ignore($this->route('id'))],
                'name_bn' => "{$req}|string|max:200", 'name_en' => "{$req}|string|max:200",
                'sort_order' => 'sometimes|integer|min:0|max:9999', 'is_active' => 'sometimes|boolean',
            ] + $classes,
            'curriculum-nodes' => [
                'qb_curriculum_version_id' => $this->isMethod('post') ? 'required|integer|exists:qb_curriculum_versions,id' : 'prohibited',
                'parent_id' => 'nullable|integer|exists:qb_curriculum_nodes,id',
                'kind' => "{$req}|in:" . implode(',', \App\Models\QbCurriculumNode::KINDS),
                'name_bn' => "{$req}|string|max:200", 'name_en' => "{$req}|string|max:200",
                'sort_order' => 'sometimes|integer|min:0|max:9999',
                'legacy_qb_chapter_id' => ['nullable', 'integer', 'exists:qb_chapters,id', Rule::unique('qb_curriculum_nodes', 'legacy_qb_chapter_id')->ignore($this->route('id'))],
                'legacy_qb_topic_id' => ['nullable', 'integer', 'exists:qb_topics,id', Rule::unique('qb_curriculum_nodes', 'legacy_qb_topic_id')->ignore($this->route('id'))],
            ],
            default => [],
        };
    }
}

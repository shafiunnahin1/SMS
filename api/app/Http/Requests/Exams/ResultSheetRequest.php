<?php

namespace App\Http\Requests\Exams;

use App\Models\Exam;
use App\Support\Tenancy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

// D197 AAD.2 (academics-advanced.md section 1.2, the closed `rule` schema): weights add up to exactly 100; every exam is of the
// sheet's program (and its batch or the whole program); best_of <= the number of exams; no exam twice. A published sheet is
// never edited (the controller refuses before this runs).
class ResultSheetRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $t = Tenancy::current()->id;
        $program = (int) $this->input('program_id');
        return [
            'program_id' => ['required', 'integer', Rule::exists('programs', 'id')->where('institution_id', $t)],
            'batch_id' => ['nullable', 'integer', Rule::exists('batches', 'id')->where('institution_id', $t)->where('program_id', $program)],
            'academic_year_id' => ['nullable', 'integer', Rule::exists('academic_years', 'id')->where('institution_id', $t)],
            'name' => 'required|string|max:100',
            'rule' => 'required|array:components,absent_policy,missing_subject_policy,pass_rule,pass_percent,use_gpa,optional_subject',
            'rule.components' => 'required|array|min:1|max:12',
            'rule.components.*' => 'required|array:exam_id,best_of,of,weight',
            'rule.components.*.weight' => 'required|numeric|min:1|max:100',
            'rule.components.*.exam_id' => 'nullable|required_without:rule.components.*.of|integer',
            'rule.components.*.of' => 'nullable|required_without:rule.components.*.exam_id|array|min:2|max:10',
            'rule.components.*.of.*' => 'integer',
            'rule.components.*.best_of' => 'nullable|required_with:rule.components.*.of|integer|min:1',
            'rule.absent_policy' => ['required', Rule::in(['zero', 'exclude'])],
            'rule.missing_subject_policy' => ['required', Rule::in(['error', 'skip_redistribute'])],
            'rule.pass_rule' => ['required', Rule::in(['total_only', 'every_subject', 'every_subject_every_exam'])],
            'rule.pass_percent' => 'required|numeric|min:0|max:100',
            'rule.use_gpa' => 'nullable|boolean',
            'rule.optional_subject' => 'nullable|in:college_rule',
            'status' => 'prohibited', 'version' => 'prohibited', 'published_at' => 'prohibited', 'created_by' => 'prohibited',
        ];
    }

    public function withValidator(Validator $v): void
    {
        $v->after(function (Validator $v) {
            if ($v->errors()->isNotEmpty()) return;
            $components = $this->input('rule.components', []);
            $sum = array_sum(array_map(fn ($c) => (float) $c['weight'], $components));
            if (abs($sum - 100) > 0.001) $v->errors()->add('rule.components', __('errors.result_sheet_weights', ['sum' => $sum]));
            $ids = [];
            foreach ($components as $i => $c) {
                if (isset($c['of'])) {
                    if (($c['best_of'] ?? 0) > count($c['of'])) $v->errors()->add("rule.components.$i.best_of", __('errors.result_sheet_best_of'));
                    array_push($ids, ...array_map('intval', $c['of']));
                } else {
                    $ids[] = (int) $c['exam_id'];
                }
            }
            if (count($ids) !== count(array_unique($ids))) { $v->errors()->add('rule.components', __('errors.result_sheet_exam_twice')); return; }
            $batch = $this->input('batch_id');
            $ok = Exam::whereIn('id', $ids)->where('program_id', (int) $this->input('program_id'))
                ->where(fn ($q) => $q->whereNull('batch_id')->when($batch, fn ($w) => $w->orWhere('batch_id', $batch)))->count();
            if ($ok !== count($ids)) $v->errors()->add('rule.components', __('errors.result_sheet_exam_scope'));
        });
    }
}

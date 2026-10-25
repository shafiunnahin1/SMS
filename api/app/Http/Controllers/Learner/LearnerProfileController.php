<?php

namespace App\Http\Controllers\Learner;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{LearnerProfile, QbClassLevel, QbExamBatch};
use App\Services\Learner\StudentValidityService;
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// D165 ST.1/ST.2: a self-registered student reads and changes their own class and SSC/HSC exam batch (learners host only; an
// institution's student has none). A batch must be active, not over, and cover the chosen class; a new class drops a batch that
// does not cover it. Purchases already made keep their validity.
class LearnerProfileController extends Controller
{
    public function show(Request $request)
    {
        return response()->json(['success' => true, 'data' => $this->data($this->profile($request))]);
    }

    public function update(Request $request)
    {
        $in = $request->validate([
            'qb_class_level_id' => ['nullable', 'integer', Rule::exists('qb_class_levels', 'id')->where('is_active', true)],
            'qb_exam_batch_id' => ['nullable', 'integer'],
        ]);
        $p = $this->profile($request);
        $class = $in['qb_class_level_id'] ?? null;
        $batch = $in['qb_exam_batch_id'] ?? null;
        if ($batch && !StudentValidityService::batchesFor($class)->contains('id', $batch)) {
            throw new BusinessException(__('errors.learner_batch_invalid'), 'learner_batch_invalid', 422);
        }
        $p->update(['qb_class_level_id' => $class, 'qb_exam_batch_id' => $batch]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->data($p)]);
    }

    private function profile(Request $request): LearnerProfile
    {
        abort_unless(Tenancy::current()?->institution_type === 'learners', 404);
        return LearnerProfile::firstOrCreate(['user_id' => $request->user()->id]);
    }

    private function data(LearnerProfile $p): array
    {
        $c = $p->qb_class_level_id ? QbClassLevel::find($p->qb_class_level_id, ['id', 'name_bn', 'name_en']) : null;
        $b = $p->qb_exam_batch_id ? QbExamBatch::find($p->qb_exam_batch_id, ['id', 'name', 'kind', 'exam_ends_on']) : null;
        return ['qb_class_level_id' => $p->qb_class_level_id, 'class_level' => $c, 'qb_exam_batch_id' => $p->qb_exam_batch_id, 'exam_batch' => $b,
            'batches' => StudentValidityService::batchesFor($p->qb_class_level_id)->map(fn ($x) => $x->only(['id', 'name', 'kind', 'exam_ends_on']))->values()];
    }
}

<?php

namespace App\Http\Controllers\Learner;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{LearnerProfile, Program, QbClassLevel, QbExamBatch, Student};
use App\Services\Learner\StudentValidityService;
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// D165 ST.1/ST.2/ST.5: a student's own class and SSC/HSC exam batch. A self-registered student (learners host) sets both; an
// institution's student has the class of their program (read-only here) and chooses only the batch. A batch must be active, not
// over, and cover the class; a new class drops a batch that does not cover it. Purchases already made keep their validity.
class LearnerProfileController extends Controller
{
    public function show(Request $request)
    {
        return response()->json(['success' => true, 'data' => $this->data($request, $this->profile($request))]);
    }

    public function update(Request $request)
    {
        $in = $request->validate([
            'qb_class_level_id' => ['nullable', 'integer', Rule::exists('qb_class_levels', 'id')->where('is_active', true)],
            'qb_exam_batch_id' => ['nullable', 'integer'],
        ]);
        $p = $this->profile($request);
        $own = self::learners();
        $class = $own ? ($in['qb_class_level_id'] ?? null) : $this->programClass($request);
        $batch = $in['qb_exam_batch_id'] ?? null;
        if ($batch && !StudentValidityService::batchesFor($class)->contains('id', $batch)) {
            throw new BusinessException(__('errors.learner_batch_invalid'), 'learner_batch_invalid', 422);
        }
        $p->update(['qb_class_level_id' => $own ? $class : null, 'qb_exam_batch_id' => $batch]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->data($request, $p)]);
    }

    private static function learners(): bool
    {
        return Tenancy::current()?->institution_type === 'learners';
    }

    private function profile(Request $request): LearnerProfile
    {
        return LearnerProfile::firstOrCreate(['user_id' => $request->user()->id]);
    }

    private function programClass(Request $request): ?int
    {
        $programId = Student::where('user_id', $request->user()->id)->value('program_id');
        return $programId ? Program::whereKey($programId)->value('qb_class_level_id') : null;
    }

    private function data(Request $request, LearnerProfile $p): array
    {
        $classId = self::learners() ? $p->qb_class_level_id : $this->programClass($request);
        $c = $classId ? QbClassLevel::find($classId, ['id', 'name_bn', 'name_en']) : null;
        $b = $p->qb_exam_batch_id ? QbExamBatch::find($p->qb_exam_batch_id, ['id', 'name', 'kind', 'exam_ends_on']) : null;
        return ['qb_class_level_id' => $classId, 'class_level' => $c, 'class_editable' => self::learners(), 'qb_exam_batch_id' => $p->qb_exam_batch_id, 'exam_batch' => $b,
            'batches' => StudentValidityService::batchesFor($classId)->map(fn ($x) => $x->only(['id', 'name', 'kind', 'exam_ends_on']))->values()];
    }
}

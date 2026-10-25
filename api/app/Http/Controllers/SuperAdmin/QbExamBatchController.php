<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, QbExamBatch, QbStudentUnlock};
use App\Services\Learner\StudentValidityService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

// D165 (3) ST.2: the Super Admin's SSC / HSC exam batches. Moving a batch's exam end date moves the validity of every purchase made
// under it (every institution's students) - a board that postpones the exam never shortens what a student bought.
class QbExamBatchController extends Controller
{
    public function index()
    {
        return response()->json(['success' => true, 'data' => QbExamBatch::orderByDesc('exam_ends_on')->get()]);
    }

    public function store(Request $request)
    {
        $b = QbExamBatch::create($this->valid($request));
        AuditLog::record('qb.exam_batch_created', $b, ['name' => $b->name]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $b], 201);
    }

    public function update(Request $request, int $id)
    {
        $b = QbExamBatch::findOrFail($id);
        $f = $this->valid($request);
        $moved = $b->exam_ends_on->toDateString() !== $f['exam_ends_on'];
        $b->update($f);
        $n = 0;
        if ($moved) {
            $end = Carbon::parse($f['exam_ends_on'], StudentValidityService::TZ)->endOfDay()->utc();
            $n = QbStudentUnlock::anyInstitution()->where('qb_exam_batch_id', $b->id)->update(['expires_at' => $end]);
        }
        AuditLog::record('qb.exam_batch_updated', $b, ['exam_ends_on' => $f['exam_ends_on'], 'purchases_moved' => $n]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $b->fresh()->toArray() + ['purchases_moved' => $n]]);
    }

    private function valid(Request $request): array
    {
        return $request->validate([
            'name' => 'required|string|max:100',
            'kind' => ['required', Rule::in(['ssc', 'hsc'])],
            'class_level_ids' => 'required|array|min:1|max:4',
            'class_level_ids.*' => ['integer', 'distinct', Rule::exists('qb_class_levels', 'id')],
            'exam_ends_on' => 'required|date_format:Y-m-d',
            'is_active' => 'boolean',
        ]);
    }
}

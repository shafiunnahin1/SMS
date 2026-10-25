<?php

namespace App\Http\Controllers\Learner;

use App\Http\Controllers\Controller;
use App\Models\{LearnerProfile, QbClassLevel};
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// D165 (1) ST.1: a self-registered student reads and changes their own class (learners host only; an institution's student has none)
class LearnerProfileController extends Controller
{
    public function show(Request $request)
    {
        return response()->json(['success' => true, 'data' => $this->data($this->profile($request))]);
    }

    public function update(Request $request)
    {
        $in = $request->validate(['qb_class_level_id' => ['nullable', 'integer', Rule::exists('qb_class_levels', 'id')->where('is_active', true)]]);
        $p = $this->profile($request);
        $p->update(['qb_class_level_id' => $in['qb_class_level_id'] ?? null]);
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
        return ['qb_class_level_id' => $p->qb_class_level_id, 'class_level' => $c];
    }
}

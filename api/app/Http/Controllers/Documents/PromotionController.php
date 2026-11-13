<?php

namespace App\Http\Controllers\Documents;

use App\Http\Controllers\Controller;
use App\Services\Documents\PromotionService;
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// D210 PTC.1: POST /students/promote { student_ids[], to_batch_id, from_program_id? } (admin) - docs/API.md "বাল্ক প্রমোশন"
class PromotionController extends Controller
{
    public function promote(Request $request, PromotionService $promotions)
    {
        $t = Tenancy::current()->id;
        $d = $request->validate([
            'student_ids' => 'required|array|min:1|max:1000', 'student_ids.*' => 'integer|distinct',
            'to_batch_id' => ['required', 'integer', Rule::exists('batches', 'id')->where('institution_id', $t)],
            'from_program_id' => ['nullable', 'integer', Rule::exists('programs', 'id')->where('institution_id', $t)],
        ]);
        return response()->json(['success' => true, 'message' => __('messages.saved'),
            'data' => $promotions->promote($d['student_ids'], (int) $d['to_batch_id'], isset($d['from_program_id']) ? (int) $d['from_program_id'] : null)]);
    }
}

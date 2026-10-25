<?php

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Services\Ai\AiReviewService;
use Illuminate\Http\Request;

// D164 (3) AI-P1.4: the platform writers' / moderators' review of the assistant's answers (central host)
class AiReviewController extends Controller
{
    public function index(Request $request, AiReviewService $reviews)
    {
        $status = $request->validate(['status' => 'nullable|in:unreviewed,approved,corrected,rewritten'])['status'] ?? 'unreviewed';
        return response()->json(['success' => true, 'data' => $reviews->queue($status)]);
    }

    public function update(Request $request, int $id, AiReviewService $reviews)
    {
        $data = $request->validate(['status' => 'required|in:approved,corrected,rewritten', 'text' => 'nullable|string|max:5000']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $reviews->decide($id, $data['status'], $data['text'] ?? null, $request->user())]);
    }
}

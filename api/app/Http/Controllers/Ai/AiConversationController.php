<?php

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Models\AiConversation;
use Illuminate\Http\Request;

// D164 AI-P1.1 / D165 ST.6: a teacher's, the head's or a student's own chats with the assistant - list, start, read. Another user's chat is a 404, like
// another institution's (the tenant scope and the user filter). Asking and answering come in AI-P1.2.
class AiConversationController extends Controller
{
    public function index(Request $request)
    {
        $rows = AiConversation::where('user_id', $request->user()->id)->orderByDesc('updated_at')->orderByDesc('id')->limit(100)->get(['id', 'title', 'updated_at']);
        return response()->json(['success' => true, 'data' => $rows->map(fn ($c) => ['id' => $c->id, 'title' => $c->title, 'updated_at' => $c->updated_at?->toIso8601String()])]);
    }

    public function store(Request $request)
    {
        $data = $request->validate(['title' => 'required|string|max:200']);
        $c = AiConversation::create(['user_id' => $request->user()->id, 'title' => $data['title']]);
        return response()->json(['success' => true, 'data' => ['id' => $c->id, 'title' => $c->title, 'messages' => []]], 201);
    }

    /** D164 (2) AI-P1.2: ask in an own chat; answers with the question, the assistant's answer and the questions it showed */
    public function ask(Request $request, int $id, \App\Services\Ai\AssistantService $assistant)
    {
        $c = AiConversation::where('user_id', $request->user()->id)->findOrFail($id);   // another user's or institution's chat is a 404 first
        $text = $request->validate(['text' => 'required|string|max:1000'])['text'];
        $out = $assistant->ask($c, $text, $request->user());
        $row = fn ($m) => ['id' => $m->id, 'role' => $m->role, 'body' => $m->body, 'kind' => $m->kind, 'sources' => $m->sources ?? [], 'rating' => $m->rating, 'review' => $m->role === 'answer' ? 'unreviewed' : null];
        return response()->json(['success' => true, 'data' => ['question' => $row($out['question']), 'answer' => $row($out['answer']), 'questions' => $out['questions'],
            'free_left' => $assistant->quotaLeft()]], 201);
    }

    /** D165 ST.6: delete an own chat for good - its messages and their reviews; the de-identified answer bank and the day's free-answer
     *  count stay (a deleted chat does not give the free answers back) */
    public function destroy(Request $request, int $id)
    {
        $c = AiConversation::where('user_id', $request->user()->id)->findOrFail($id);
        \Illuminate\Support\Facades\DB::transaction(function () use ($c) {
            $ids = \App\Models\AiMessage::where('ai_conversation_id', $c->id)->pluck('id');
            \App\Models\AiReview::whereIn('ai_message_id', $ids)->delete();
            \App\Models\AiAnswerReveal::whereIn('ai_message_id', $ids)->update(['ai_message_id' => null]);
            \App\Models\AiMessage::whereIn('id', $ids)->delete();
            $c->delete();
        });
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** D164 (3) AI-P1.3: 👍 / 👎 (or clear) on an answer in an own chat; a thumbs-down answer comes first in the review queue */
    public function rate(Request $request, int $id)
    {
        $m = \App\Models\AiMessage::where('role', 'answer')->whereHas('conversation', fn ($c) => $c->where('user_id', $request->user()->id))->findOrFail($id);
        $rating = $request->validate(['rating' => 'nullable|integer|in:-1,1'])['rating'] ?? null;
        $m->update(['rating' => $rating]);
        return response()->json(['success' => true, 'data' => ['id' => $m->id, 'rating' => $m->rating]]);
    }

    /** AI-P1.4 (D164 (3)): the head decides whether this institution's answers go to the platform reviewers (default yes) */
    public function settings(Request $request)
    {
        $i = \App\Support\Tenancy::current();
        if ($request->isMethod('put')) {
            $on = (bool) $request->validate(['send_to_review' => 'required|boolean'])['send_to_review'];
            $i->forceFill(['settings' => array_merge($i->settings ?? [], [\App\Services\Ai\AiReviewService::SETTING => $on])])->save();
            \App\Models\AuditLog::record('ai.review_setting', $i, ['send_to_review' => $on]);
        }
        return response()->json(['success' => true, 'data' => ['send_to_review' => \App\Services\Ai\AiReviewService::sendsToReview($i->fresh())]]);
    }

    public function show(Request $request, int $id)
    {
        $c = AiConversation::where('user_id', $request->user()->id)->with('messages.review')->findOrFail($id);
        return response()->json(['success' => true, 'data' => ['id' => $c->id, 'title' => $c->title, 'messages' => $c->messages->map(fn ($m) => [
            // AI-P1.4: a corrected or rewritten answer is shown instead of the first one, which stays as history
            'id' => $m->id, 'role' => $m->role, 'body' => $m->review?->reviewer_text ?: $m->body, 'original' => $m->review?->reviewer_text ? $m->body : null, 'kind' => $m->kind, 'sources' => $m->sources ?? [], 'rating' => $m->rating,
            'review' => $m->role === 'answer' ? ($m->review?->status ?? 'unreviewed') : null,
            // AI-P1.6: still being rephrased (a worker that never ran stops counting after 2 minutes); AI-P1.6.1: the template it replaced
            'rephrasing' => $m->model_version === \App\Jobs\RephraseAnswerJob::PENDING && $m->created_at?->gt(now()->subMinutes(2)),
            'template' => $m->review?->reviewer_text ? null : $m->template_body,
            'created_at' => $m->created_at?->toIso8601String()])]]);
    }
}

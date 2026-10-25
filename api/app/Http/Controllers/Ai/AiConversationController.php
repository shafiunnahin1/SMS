<?php

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Models\AiConversation;
use Illuminate\Http\Request;

// D164 AI-P1.1: a teacher's or the head's own chats with the assistant - list, start, read. Another user's chat is a 404, like
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

    /** D164 (3) AI-P1.3: 👍 / 👎 (or clear) on an answer in an own chat; a thumbs-down answer comes first in the review queue */
    public function rate(Request $request, int $id)
    {
        $m = \App\Models\AiMessage::where('role', 'answer')->whereHas('conversation', fn ($c) => $c->where('user_id', $request->user()->id))->findOrFail($id);
        $rating = $request->validate(['rating' => 'nullable|integer|in:-1,1'])['rating'] ?? null;
        $m->update(['rating' => $rating]);
        return response()->json(['success' => true, 'data' => ['id' => $m->id, 'rating' => $m->rating]]);
    }

    public function show(Request $request, int $id)
    {
        $c = AiConversation::where('user_id', $request->user()->id)->with('messages.review')->findOrFail($id);
        return response()->json(['success' => true, 'data' => ['id' => $c->id, 'title' => $c->title, 'messages' => $c->messages->map(fn ($m) => [
            'id' => $m->id, 'role' => $m->role, 'body' => $m->body, 'kind' => $m->kind, 'sources' => $m->sources ?? [], 'rating' => $m->rating,
            'review' => $m->role === 'answer' ? ($m->review?->status ?? 'unreviewed') : null, 'created_at' => $m->created_at?->toIso8601String()])]]);
    }
}

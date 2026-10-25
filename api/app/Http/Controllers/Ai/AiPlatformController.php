<?php

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Models\{AiAnswerBank, AiAnswerReveal, AiMessage, AiReview, AuditLog, PlatformSetting};
use App\Services\Ai\AssistantService;
use Illuminate\Http\Request;

// D164 AI-P1.5: the Super Admin's assistant settings (free answers a day, daily question limit per institution - both open until the
// owner sets a price) and the platform usage report (counts only - no question text, teacher or institution)
class AiPlatformController extends Controller
{
    public function settings()
    {
        return response()->json(['success' => true, 'data' => self::current()]);
    }

    public function update(Request $request)
    {
        $f = $request->validate(['free_answers_per_day' => 'required|integer|min:0|max:1000', 'daily_question_limit' => 'nullable|integer|min:1|max:100000']);
        PlatformSetting::write(AssistantService::QUOTA_KEY, (int) $f['free_answers_per_day'], $request->user()->id);
        PlatformSetting::write(AssistantService::LIMIT_KEY, $f['daily_question_limit'] ?? null, $request->user()->id);
        AuditLog::record('ai.platform_settings', $request->user(), $f);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::current()]);
    }

    /** ?days=7: per day questions, answers by kind, ratings, reviews and free reveals over every institution; the bank's size */
    public function report(Request $request)
    {
        $days = (int) ($request->validate(['days' => 'nullable|integer|min:1|max:90'])['days'] ?? 7);
        $from = today()->subDays($days - 1)->startOfDay();
        $count = fn ($q, string $col = 'created_at') => $q->where($col, '>=', $from)->selectRaw("DATE({$col}) AS d, COUNT(*) AS n")->groupBy('d')->pluck('n', 'd');
        $rows = [];
        foreach (range(0, $days - 1) as $k) $rows[] = ['date' => today()->subDays($days - 1 - $k)->toDateString()];
        $series = [
            'questions' => $count(AiMessage::anyInstitution()->where('role', 'question')),
            'direct' => $count(AiMessage::anyInstitution()->where('kind', 'direct')),
            'composed' => $count(AiMessage::anyInstitution()->where('kind', 'composed')),
            'not_found' => $count(AiMessage::anyInstitution()->where('kind', 'not_found')),
            'thumbs_down' => $count(AiMessage::anyInstitution()->where('rating', -1)),
            'reviewed' => $count(AiReview::anyInstitution()->where('status', '<>', 'unreviewed'), 'reviewed_at'),
            'free_reveals' => $count(AiAnswerReveal::anyInstitution()),
        ];
        foreach ($rows as &$r) foreach ($series as $k => $s) $r[$k] = (int) ($s[$r['date']] ?? 0);
        unset($r);
        return response()->json(['success' => true, 'data' => ['days' => $rows, 'unreviewed' => AiReview::anyInstitution()->where('status', 'unreviewed')->count(),
            'bank' => AiAnswerBank::anyInstitution()->count()]]);
    }

    private static function current(): array
    {
        $limit = PlatformSetting::read(AssistantService::LIMIT_KEY);
        return ['free_answers_per_day' => (int) (PlatformSetting::read(AssistantService::QUOTA_KEY, AssistantService::QUOTA_DEFAULT) ?? AssistantService::QUOTA_DEFAULT),
            'daily_question_limit' => $limit === null || $limit === '' ? null : (int) $limit];
    }
}

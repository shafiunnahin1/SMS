<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * D164 (6) AI-P1.6: asks the small CPU model (llama.cpp `llama-server`, OpenAI-compatible chat API) to put a composed answer in
 * natural Bangla. It gets only the text already shown to the teacher (a locked answer was never in it), adds nothing, and the
 * trust rule rejects a reply with a number or a correct-option mark that the given text does not have - the template then stays.
 * Off when no URL is configured; a slow or stopped model is the same as off. Logs carry no question or answer text.
 */
class AnswerRephraser
{
    private const PROMPT = "তুমি একজন শিক্ষকের সহকারী। নিচের লেখাটি স্বাভাবিক, সহজ বাংলায় নতুন করে সাজিয়ে লেখো। "
        . "নতুন কোনো তথ্য, সংখ্যা, বিকল্প বা উত্তর যোগ করবে না, কিছু বাদও দেবে না। ✓ চিহ্ন যে বিকল্পে আছে শুধু সেখানেই রাখবে। শুধু সাজানো লেখাটি দেবে। /no_think";

    public static function enabled(): bool
    {
        return trim((string) config('services.ai_llm.url')) !== '';
    }

    public static function model(): string
    {
        return (string) config('services.ai_llm.model');
    }

    /** the rephrased text, or null (off, failed, too slow or not trusted) */
    public function rephrase(string $text): ?string
    {
        if (!self::enabled() || trim($text) === '') return null;
        try {
            $res = Http::timeout((int) config('services.ai_llm.timeout', 45))->acceptJson()
                ->post(rtrim((string) config('services.ai_llm.url'), '/') . '/v1/chat/completions', [
                    'model' => self::model(), 'temperature' => 0.2, 'max_tokens' => 800, 'stream' => false,
                    'messages' => [['role' => 'system', 'content' => self::PROMPT], ['role' => 'user', 'content' => $text]],
                ]);
        } catch (\Throwable $e) {
            Log::warning('ai.rephrase_unreachable', ['error' => class_basename($e)]);
            return null;
        }
        if (!$res->successful()) {
            Log::warning('ai.rephrase_http', ['status' => $res->status()]);
            return null;
        }
        $out = trim(preg_replace('/<think>.*?<\/think>/su', '', (string) $res->json('choices.0.message.content')));
        if (!self::trusted($text, $out)) {
            Log::info('ai.rephrase_rejected');
            return null;
        }
        return $out;
    }

    /** the trust rule: every number in the reply is in the given text, and no more ✓ marks than given; not empty, not runaway */
    public static function trusted(string $given, string $reply): bool
    {
        if ($reply === '' || mb_strlen($reply) > 2 * mb_strlen($given) + 200) return false;
        $numbers = fn (string $s) => array_unique(preg_match_all('/\d+(?:[.,]\d+)?/u', strtr($s, array_combine(['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'], range(0, 9))), $m) ? $m[0] : []);
        if (array_diff($numbers($reply), $numbers($given))) return false;
        return mb_substr_count($reply, '✓') <= mb_substr_count($given, '✓');
    }
}

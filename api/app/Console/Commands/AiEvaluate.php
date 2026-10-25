<?php

namespace App\Console\Commands;

use App\Models\{Institution, QbQuestion, User};
use App\Services\Ai\{AnswerRephraser, AssistantService};
use App\Services\QbQuestionFinderService;
use App\Support\Tenancy;
use Illuminate\Console\Command;

/**
 * D164 (5) AI-P1.5 quality gate. `--make=200` writes an evaluation set from the platform's published questions (each question's
 * text, without its last words (about 80% kept) the way a teacher asks, with the question's id as the expected source). Then
 * the set is run as one institution: the expected question must be in the assistant's top 3 for at least 70% of the items, and no
 * other institution's answer-bank row may ever come back. Prints counts only; writes nothing but the set file.
 */
class AiEvaluate extends Command
{
    protected $signature = 'ai:evaluate {file : JSON [{question, expect_question_id}]} {--make= : first write a set of this many items} {--institution= : the institution slug to ask as} {--bar=70} {--rephrase= : AI-P1.6 also send this many composed answers to the configured model}';
    protected $description = 'D164 quality gate for the AI assistant: top-3 source hit rate and no cross-institution answers';

    public function handle(AssistantService $assistant): int
    {
        $file = (string) $this->argument('file');
        if ($n = (int) $this->option('make')) {
            $set = QbQuestion::where('status', 'published')->whereNotNull('question_text')->inRandomOrder()->limit($n)->get(['id', 'question_text'])
                ->map(function ($q) {
                    $words = preg_split('/\s+/u', trim(strip_tags((string) $q->question_text)));
                    return ['question' => implode(' ', array_slice($words, 0, max(3, (int) ceil(count($words) * 0.8)))), 'expect_question_id' => $q->id];
                })->values()->all();
            file_put_contents($file, json_encode($set, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            $this->info('wrote ' . count($set) . " items to {$file}");
        }
        $set = json_decode((string) @file_get_contents($file), true);
        if (!is_array($set) || !$set) { $this->error("no evaluation set in {$file}"); return self::FAILURE; }
        $institution = Institution::where('slug', (string) $this->option('institution'))->first();
        if (!$institution) { $this->error('give --institution=<slug> of an existing institution'); return self::FAILURE; }

        [$hits, $leaks] = Tenancy::as($institution, function () use ($set, $assistant, $institution) {
            $hits = 0; $leaks = 0;
            foreach ($set as $item) {
                if (in_array((int) $item['expect_question_id'], array_slice($assistant->rankedQuestionIds((string) $item['question']), 0, 3), true)) $hits++;
                $norm = QbQuestionFinderService::normalize((string) $item['question']);
                if ($norm !== '') $leaks += $assistant->bankCandidates($norm)->filter(fn ($r) => $r->institution_id !== null && (int) $r->institution_id !== (int) $institution->id)->count();
            }
            return [$hits, $leaks];
        });
        $rate = round(100 * $hits / count($set), 1);
        $pass = $rate >= (float) $this->option('bar') && $leaks === 0;
        $this->line(sprintf('items %d · top-3 hits %d (%.1f%%, bar %s%%)', count($set), $hits, $rate, $this->option('bar')));
        $this->line("cross-institution answers {$leaks}");
        $this->line($pass ? 'PASS' : 'FAIL');
        if ($n = (int) $this->option('rephrase')) $this->rephraseReport(array_slice($set, 0, $n), $institution, $assistant);
        return $pass ? self::SUCCESS : self::FAILURE;
    }

    /**
     * AI-P1.6 comparison of models: run once per model (change AI_LLM_MODEL / the llama-server model) on the same set. Prints how
     * many replies the trust rule accepted and the average seconds - counts only, no text.
     */
    private function rephraseReport(array $items, Institution $institution, AssistantService $assistant): void
    {
        if (!AnswerRephraser::enabled()) { $this->line('model: off (set AI_LLM_URL)'); return; }
        $rephraser = app(AnswerRephraser::class);
        [$ok, $secs] = Tenancy::as($institution, function () use ($items, $assistant, $rephraser) {
            $user = User::where('role', 'admin')->first() ?? User::first();
            $ok = 0; $secs = 0.0;
            foreach ($items as $item) {
                $text = $assistant->composedPreview((string) $item['question'], $user);
                $t = microtime(true);
                if ($rephraser->rephrase($text) !== null) $ok++;
                $secs += microtime(true) - $t;
            }
            return [$ok, $secs];
        });
        $this->line(sprintf('model %s · rephrased %d of %d · avg %.1f s', AnswerRephraser::model(), $ok, count($items), $secs / max(1, count($items))));
    }
}

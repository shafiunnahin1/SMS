<?php

namespace App\Console\Commands;

use App\Models\{AiHelpArticle, Institution, QbQuestion, User};
use App\Services\Ai\{AnswerRephraser, AssistantService};
use App\Services\QbQuestionFinderService;
use App\Support\Tenancy;
use Illuminate\Console\Command;

/**
 * D164 (5) AI-P1.5 quality gate. `--make=200` writes an evaluation set from the platform's published questions (each question's
 * text, without its last words (about 80% kept) the way a teacher asks, with the question's id as the expected source). Then
 * the set is run as one institution: the expected question must be in the assistant's top 3 for at least 70% of the items, and no
 * other institution's answer-bank row may ever come back. Prints counts only; writes nothing but the set file.
 * D166 AI-Q6: reported separately - the source set (the 200-question gate only when it has 200 items, a smaller set is labelled
 * so), a "not found" set (resources/ai/eval-not-found.json: questions with no source must get not_found, never a guess), a help set
 * (every approved platform article's title asked as a user of its role, which must get that article), and the model off / on.
 */
class AiEvaluate extends Command
{
    protected $signature = 'ai:evaluate {file : JSON [{question, expect_question_id}]} {--make= : first write a set of this many items} {--institution= : the institution slug to ask as} {--bar=70} {--rephrase= : AI-P1.6 also send this many composed answers to the configured model} {--not-found= : D166 AI-Q6 the not-found set (default resources/ai/eval-not-found.json)} {--nf-bar=90} {--help-bar=90}';
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
        $sourcePass = $rate >= (float) $this->option('bar') && $leaks === 0;
        $published = QbQuestion::where('status', 'published')->count();
        $label = count($set) >= 200 ? '200-question gate' : sprintf('small set (%d < 200, not the 200-question gate; %d published)', count($set), $published);
        $this->line("[sources] {$label}");
        $this->line(sprintf('items %d · top-3 hits %d (%.1f%%, bar %s%%)', count($set), $hits, $rate, $this->option('bar')));
        $this->line("cross-institution answers {$leaks}");
        $nfPass = $this->notFoundReport($institution, $assistant);
        $helpPass = $this->helpReport($institution, $assistant);
        $this->line(\App\Services\Ai\AnswerRephraser::enabled() ? '[model] on (' . AnswerRephraser::model() . ') - the results above are the deterministic answers; see the rephrase line'
            : '[model] off - every answer above is deterministic');
        $pass = $sourcePass && $nfPass && $helpPass;
        $this->line($pass ? 'PASS' : 'FAIL');
        if ($n = (int) $this->option('rephrase')) $this->rephraseReport(array_slice($set, 0, $n), $institution, $assistant);
        return $pass ? self::SUCCESS : self::FAILURE;
    }

    /** D166 AI-Q6: questions with no source must be answered not_found (asked as the institution's head) */
    private function notFoundReport(Institution $institution, AssistantService $assistant): bool
    {
        $file = (string) ($this->option('not-found') ?: resource_path('ai/eval-not-found.json'));
        $items = json_decode((string) @file_get_contents($file), true)['items'] ?? [];
        [$ok, $asked] = Tenancy::as($institution, function () use ($items, $assistant) {
            $user = User::where('role', 'admin')->first();
            if (!$user || $items === []) return [0, 0];
            return [collect($items)->filter(fn ($q) => $assistant->preview((string) $q, $user)['kind'] === 'not_found')->count(), count($items)];
        });
        if ($asked === 0) { $this->line('[not found] no set or no admin to ask as - skipped'); return true; }
        $rate = round(100 * $ok / $asked, 1);
        $this->line(sprintf('[not found] items %d · answered not found %d (%.1f%%, bar %s%%)', $asked, $ok, $rate, $this->option('nf-bar')));
        return $rate >= (float) $this->option('nf-bar');
    }

    /** D166 AI-Q6: every approved platform article, asked by its title as an existing user of its first role here, finds that article */
    private function helpReport(Institution $institution, AssistantService $assistant): bool
    {
        $articles = Tenancy::withoutTenancy(fn () => AiHelpArticle::whereNull('institution_id')->where('status', 'approved')->get());
        [$ok, $asked, $skipped] = Tenancy::as($institution, function () use ($articles, $assistant) {
            $ok = 0; $asked = 0; $skipped = 0;
            foreach ($articles as $a) {
                $role = collect($a->roles ?? [])->first(fn ($r) => $r !== 'super_admin');
                $user = $role ? User::where('role', $role)->where('is_active', true)->first() : null;
                if (!$user) { $skipped++; continue; }
                app()->setLocale($a->locale);
                $answer = $assistant->preview((string) $a->title, $user);
                $asked++;
                if ($answer['kind'] === 'help' && in_array($answer['sources'][0]['id'] ?? null, [$a->id, ...AiHelpArticle::where('base_article_id', $a->id)->pluck('id')->all()], true)) $ok++;
            }
            return [$ok, $asked, $skipped];
        });
        if ($asked === 0) { $this->line("[help] no approved article with a user of its role here - skipped ({$skipped})"); return true; }
        $rate = round(100 * $ok / $asked, 1);
        $this->line(sprintf('[help] articles %d · found %d (%.1f%%, bar %s%%) · skipped (no user of the role) %d', $asked, $ok, $rate, $this->option('help-bar'), $skipped));
        return $rate >= (float) $this->option('help-bar');
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

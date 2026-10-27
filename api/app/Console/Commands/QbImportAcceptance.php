<?php

namespace App\Console\Commands;

use App\Models\{QbImportBatch, QbImportRecord, QbQuestion, QbSubject, User};
use App\Services\QbImportService;
use App\Support\QbImportFixtures;
use App\Support\Toon\ToonEncoder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

// D123 (8): the R2.1.3 acceptance run - the same mixed questions as JSON and as TOON go through the real chunked staging;
// exact counts, identical staged records, LaTeX unchanged, the expected failures reported, a quick edit kept, and only the
// selected records are sent for review (D154). Everything it writes is rolled back (and its files removed), so it can run on a dev database.
class QbImportAcceptance extends Command
{
    protected $signature = 'qb:import-acceptance {--count=10000}';
    protected $description = 'R2.1.3 acceptance: a mixed JSON and TOON import of --count questions through the real staging (rolled back)';

    public function handle(QbImportService $imports): int
    {
        $n = (int) $this->option('count');
        config(['queue.default' => 'sync', 'qb_import.max_records' => max($n, (int) config('qb_import.max_records'))]);
        $problems = [];
        $report = [];
        $uuids = [];
        DB::beginTransaction();
        try {
            $user = User::create(['institution_id' => null, 'name' => 'acceptance', 'role' => 'content_writer', 'phone' => '0199' . random_int(1000000, 9999999),
                'password' => bin2hex(random_bytes(12)), 'is_active' => true]);
            $subject = 'Acceptance ' . bin2hex(random_bytes(3));
            QbSubject::create(['name_bn' => $subject, 'name_en' => $subject]);
            $data = QbImportFixtures::mixed($n, $subject, ' #' . bin2hex(random_bytes(2)));
            $files = ['json' => json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'toon' => ToonEncoder::encode($data)];
            $batches = [];
            foreach ($files as $format => $bytes) {
                $t = microtime(true);
                [$batch] = $imports->create($user, [['name' => "acceptance.{$format}", 'bytes' => $bytes]]);
                $batch->refresh();
                $uuids[] = $batch->uuid;
                $report[$format] = ['bytes' => strlen($bytes), 'seconds' => round(microtime(true) - $t, 2), 'status' => $batch->status,
                    'total' => $batch->total_records, 'valid' => $batch->valid_records, 'invalid' => $batch->invalid_records];
                $batches[$format] = $batch;
            }
            $bad = intdiv($n, QbImportFixtures::BAD_EVERY);
            foreach ($batches as $format => $b) {
                if ([$b->status, $b->total_records, $b->invalid_records, $b->valid_records] !== ['ready', $n, $bad, $n - $bad]) {
                    $problems[] = "{$format}: counts " . json_encode($report[$format]) . " expected total {$n}, invalid {$bad}";
                }
            }

            // identical staged records; LaTeX exactly as written
            $source = $data['questions'];
            $mismatch = 0;
            $latex = 0;
            QbImportRecord::where('qb_import_batch_id', $batches['json']->id)->orderBy('record_index')->chunk(1000, function ($rows) use ($batches, $source, &$mismatch, &$latex) {
                $toon = QbImportRecord::where('qb_import_batch_id', $batches['toon']->id)->whereBetween('record_index', [$rows->first()->record_index, $rows->last()->record_index])
                    ->get()->keyBy('record_index');
                foreach ($rows as $r) {
                    $o = $toon[$r->record_index] ?? null;
                    if (!$o || $o->payload !== $r->payload || $o->errors !== $r->errors || $o->type_slug !== $r->type_slug) $mismatch++;
                    $src = $source[$r->record_index];
                    $want = isset($src['creative_parts']) ? $src['stimulus_text'] . "\n\n" . $src['question_text'] : $src['question_text'];
                    if (!$r->errors && $r->payload['question_text'] !== $want) $latex++;
                }
            });
            if ($mismatch) $problems[] = "{$mismatch} records differ between JSON and TOON";
            if ($latex) $problems[] = "{$latex} question texts changed";
            $report['failures_reported'] = QbImportRecord::where('qb_import_batch_id', $batches['json']->id)->whereNotNull('errors')->where('errors', 'like', '%question_type%')->count();

            // quick edit fixes one failure; select 100 valid + the fixed one; import selected
            $json = $batches['json'];
            $fix = QbImportRecord::where('qb_import_batch_id', $json->id)->whereNotNull('errors')->orderBy('record_index')->first();
            $imports->edit($fix, ['type' => 'short']);
            if ($fix->fresh()->errors) $problems[] = 'the quick edit did not fix the record';
            $chosen = QbImportRecord::where('qb_import_batch_id', $json->id)->whereNull('errors')->where('duplicate_status', 'none')->where('id', '!=', $fix->id)->orderBy('record_index')->limit(100)->pluck('id')->push($fix->id);
            QbImportRecord::whereIn('id', $chosen)->update(['selected' => true]);
            $before = QbQuestion::count();
            $t = microtime(true);
            $result = $imports->finalize($json->fresh(), $user);
            $report['finalize'] = $result + ['seconds' => round(microtime(true) - $t, 2)];
            if ($result['imported'] !== $chosen->count() || QbQuestion::count() - $before !== $chosen->count()) $problems[] = 'import selected: ' . json_encode($result);
            $draft = QbQuestion::find($fix->fresh()->qb_question_id);
            if (!$draft || $draft->status !== 'review' || $draft->question_text !== $fix->fresh()->payload['question_text']) $problems[] = 'the quick-edited record was not sent for review (D154)';
        } finally {
            DB::rollBack();
            foreach ($uuids as $u) Storage::disk('private')->deleteDirectory("platform/qb-imports/{$u}");
        }

        $this->line(json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        foreach ($problems as $p) $this->error($p);
        if ($problems) return self::FAILURE;
        $this->info("acceptance passed: {$n} questions as JSON and TOON");
        return self::SUCCESS;
    }
}

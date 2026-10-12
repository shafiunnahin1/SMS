<?php

namespace App\Console\Commands;

use App\Models\{QbChapter, QbChapterClassLevel, QbClassLevel, QbClassLevelSubject, QbCreativePart, QbImportMap, QbMedia, QbMediaLink, QbQuestion,
    QbQuestionClassLevel, QbQuestionOccurrence, QbQuestionOption, QbQuestionType, QbSubject, QbTopic, User};
use App\Support\Money;
use Illuminate\Console\Command;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\{DB, Storage};

// QB.11 (D69, docs/modules/question-bank.md §6): brings the owner's qbank data over - curriculum, question types (matched by slug),
// questions with their class links, options, creative parts (the first level), occurrences and pictures. qb_import_map remembers
// every qbank row taken, so a second run takes nothing twice. Questions arrive as `review` (a moderator publishes them).
// --dry-run does the whole import inside a transaction and rolls it back (exact counts, nothing kept, no file copied).
// Not taken (counted in the report): structured items / stimuli / interactions, nested creative parts, question sets, OMR.
class QbImportFromQbank extends Command
{
    protected $signature = 'qb:import-from-qbank {--dry-run : count only, keep nothing} {--user= : the Super Admin the imported rows are written by}
        {--media-path= : the folder that holds qbank\'s stored files (its storage/app/public)} {--connection=qbank}';
    protected $description = 'Import curriculum, questions and pictures from the qbank database (D69)';

    private Connection $src;
    private array $report = [];
    private array $skipped = [];
    private int $by;

    private const DIFFICULTY = ['very_easy' => 1, 'easy' => 2, 'medium' => 3, 'hard' => 4, 'very_hard' => 5];
    private const COGNITIVE = ['knowledge' => 'knowledge', 'understanding' => 'understanding', 'comprehension' => 'understanding', 'application' => 'application', 'higher_order' => 'higher_order'];
    private const LEVELS = ['higher_secondary', 'secondary', 'primary', 'madrasa', 'technical', 'admission'];
    private const OWNERS = ['question' => 'question', 'question_option' => 'option', 'creative_question_part' => 'creative_part'];

    public function handle(): int
    {
        $by = $this->option('user') ? User::platform()->whereKey($this->option('user'))->where('role', 'super_admin')->value('id')
            : User::platform()->where('role', 'super_admin')->orderBy('id')->value('id');
        if (!$by) { $this->error('No Super Admin found (--user=<id> of a super_admin).'); return self::FAILURE; }
        $this->by = (int) $by;
        $this->src = DB::connection($this->option('connection'));
        $dry = (bool) $this->option('dry-run');

        DB::beginTransaction();
        try {
            $this->classLevels(); $this->subjects(); $this->chapters(); $this->topics(); $this->types(); $this->questions(); $this->media($dry);
            $dry ? DB::rollBack() : DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }
        $this->line($dry ? 'DRY RUN - nothing was kept.' : 'Imported.');
        $this->table(['what', 'new', 'already here'], collect($this->report)->map(fn ($r, $k) => [$k, $r['new'] ?? 0, $r['kept'] ?? 0])->values()->all());
        if ($this->skipped) $this->table(['skipped', 'why', 'rows'], collect($this->skipped)->map(fn ($n, $k) => [...explode('|', $k, 2), $n])->values()->all());
        return self::SUCCESS;
    }

    // ---- map ----

    private function target(string $table, int $id): ?int
    {
        return QbImportMap::where('source', 'qbank')->where('source_table', $table)->where('source_id', $id)->value('target_id');
    }

    private function take(string $table, int $id, string $target, \Closure $make): ?int
    {
        if ($t = $this->target($table, $id)) { $this->count($table, 'kept'); return (int) $t; }
        $model = $make();
        if (!$model) return null;
        QbImportMap::create(['source' => 'qbank', 'source_table' => $table, 'source_id' => $id, 'target_table' => $target, 'target_id' => $model->id]);
        $this->count($table, 'new');
        return $model->id;
    }

    private function count(string $table, string $kind): void { $this->report[$table][$kind] = ($this->report[$table][$kind] ?? 0) + 1; }
    private function skip(string $what, string $why): void { $this->skipped["{$what}|{$why}"] = ($this->skipped["{$what}|{$why}"] ?? 0) + 1; }
    private function rows(string $table) { return $this->src->getSchemaBuilder()->hasTable($table) ? $this->src->table($table)->orderBy('id')->get() : collect(); }
    private function json($v) { return is_string($v) && $v !== '' ? json_decode($v, true) : (is_array($v) ? $v : null); }

    // ---- curriculum ----

    private function classLevels(): void
    {
        $levels = $this->src->getSchemaBuilder()->hasTable('education_levels') ? $this->src->table('education_levels')->pluck('slug', 'id') : collect();
        foreach ($this->rows('class_levels') as $r) {
            $slug = (string) ($levels[$r->education_level_id ?? 0] ?? '');
            $level = collect(self::LEVELS)->first(fn ($l) => str_contains(str_replace('-', '_', $slug), $l)) ?? 'other';
            $this->take('class_levels', $r->id, 'qb_class_levels', fn () => QbClassLevel::create(['name_bn' => $r->name_bn, 'name_en' => $r->name_en ?: $r->name_bn,
                'education_level' => $level, 'sort_order' => (int) ($r->sort_order ?? 0), 'is_active' => (bool) ($r->is_active ?? true)]));
        }
    }

    private function subjects(): void
    {
        foreach ($this->rows('subjects') as $r) {
            $this->take('subjects', $r->id, 'qb_subjects', fn () => QbSubject::create(['name_bn' => $r->name_bn, 'name_en' => $r->name_en ?: $r->name_bn,
                'code' => $r->code ? mb_substr($r->code, 0, 30) : null, 'sort_order' => (int) ($r->sort_order ?? 0), 'is_active' => (bool) ($r->is_active ?? true)]));
        }
        $this->pivot('class_level_subject', 'class_level_id', 'class_levels', 'subject_id', 'subjects',
            fn ($a, $b) => QbClassLevelSubject::firstOrCreate(['qb_class_level_id' => $a, 'qb_subject_id' => $b]));
    }

    private function chapters(): void
    {
        foreach ($this->rows('chapters') as $r) {
            $subject = $this->target('subjects', (int) $r->subject_id);
            if (!$subject) { $this->skip('chapters', 'its subject was not imported'); continue; }
            $this->take('chapters', $r->id, 'qb_chapters', fn () => QbChapter::create(['qb_subject_id' => $subject, 'name_bn' => $r->name_bn, 'name_en' => $r->name_en ?: $r->name_bn,
                'number' => ctype_digit((string) $r->chapter_number) && (int) $r->chapter_number < 65536 ? (int) $r->chapter_number : null, 'sort_order' => (int) ($r->sort_order ?? 0)]));
        }
        $this->pivot('chapter_class_level', 'chapter_id', 'chapters', 'class_level_id', 'class_levels',
            fn ($a, $b) => QbChapterClassLevel::firstOrCreate(['qb_chapter_id' => $a, 'qb_class_level_id' => $b]));
    }

    private function topics(): void
    {
        foreach ($this->rows('topics') as $r) {
            $chapter = $this->target('chapters', (int) $r->chapter_id);
            if (!$chapter) { $this->skip('topics', 'its chapter was not imported'); continue; }
            $this->take('topics', $r->id, 'qb_topics', fn () => QbTopic::create(['qb_chapter_id' => $chapter, 'name_bn' => $r->name_bn, 'name_en' => $r->name_en ?: $r->name_bn,
                'sort_order' => (int) ($r->sort_order ?? 0)]));
        }
    }

    private function pivot(string $table, string $aCol, string $aTable, string $bCol, string $bTable, \Closure $link): void
    {
        if (!$this->src->getSchemaBuilder()->hasTable($table)) return;
        foreach ($this->src->table($table)->get() as $r) {
            [$a, $b] = [$this->target($aTable, (int) $r->{$aCol}), $this->target($bTable, (int) $r->{$bCol})];
            if ($a && $b) $link($a, $b); else $this->skip($table, 'one side was not imported');
        }
    }

    /** By slug: the types seeded here come from qbank; an unknown slug becomes family `other` */
    private function types(): void
    {
        foreach ($this->rows('question_types') as $r) {
            $this->take('question_types', $r->id, 'qb_question_types', fn () => QbQuestionType::where('slug', $r->slug)->first()
                ?? QbQuestionType::create(['slug' => $r->slug, 'name_bn' => $r->name_bn, 'name_en' => $r->name_en ?: $r->name_bn, 'family' => 'other',
                    'is_active' => (bool) ($r->is_active ?? true), 'sort_order' => (int) ($r->sort_order ?? 0)]));
        }
    }

    // ---- questions ----

    private function questions(): void
    {
        foreach ($this->rows('questions') as $r) {
            if ($this->target('questions', $r->id)) { $this->count('questions', 'kept'); continue; }
            $type = $this->target('question_types', (int) $r->question_type_id);
            $subject = $this->target('subjects', (int) $r->subject_id);
            if (!$type || !$subject) { $this->skip('questions', 'its type or subject was not imported'); continue; }
            if (trim((string) $r->question_text) === '' && !$r->question_content_json) { $this->skip('questions', 'no question text'); continue; }
            $id = $this->take('questions', $r->id, 'qb_questions', fn () => QbQuestion::create([
                'qb_question_type_id' => $type, 'qb_subject_id' => $subject,
                'qb_chapter_id' => $r->chapter_id ? $this->target('chapters', (int) $r->chapter_id) : null,
                'qb_topic_id' => $r->topic_id ? $this->target('topics', (int) $r->topic_id) : null,
                'difficulty' => self::DIFFICULTY[$r->difficulty] ?? 3, 'marks' => is_numeric($r->marks) && Money::toPaisa((string) $r->marks) > 0 && Money::toPaisa((string) $r->marks) < 100000 ? Money::format(Money::toPaisa((string) $r->marks)) : '1.00',
                'language' => in_array($r->language, ['bn', 'en'], true) ? $r->language : 'bn',
                'content_mode' => ['plain_text' => 'plain_text', 'rich_math' => 'rich_math', 'mixed_content' => 'mixed', 'mixed' => 'mixed'][$r->content_mode] ?? 'plain_text',
                'question_text' => (string) $r->question_text, 'question_json' => $this->json($r->question_content_json),
                'answer_text' => $r->answer_text, 'answer_json' => $this->json($r->answer_content_json),
                'explanation_text' => $r->explanation_text, 'explanation_json' => $this->json($r->explanation_content_json),
                'status' => 'review', 'created_by' => $this->by]));
            $this->children((int) $r->id, $id);
        }
    }

    /** Only for a question taken in this run - its rows come with it, once */
    private function children(int $src, int $q): void
    {
        foreach ($this->src->table('class_level_question')->where('question_id', $src)->pluck('class_level_id') as $cl) {
            if ($t = $this->target('class_levels', (int) $cl)) QbQuestionClassLevel::firstOrCreate(['qb_question_id' => $q, 'qb_class_level_id' => $t]);
        }
        foreach ($this->src->table('question_options')->where('question_id', $src)->orderBy('sort_order')->orderBy('id')->get() as $o) {
            $this->take('question_options', $o->id, 'qb_question_options', fn () => QbQuestionOption::create(['qb_question_id' => $q, 'label' => mb_substr((string) $o->option_label, 0, 10),
                'content_text' => (string) $o->option_text, 'content_json' => $this->json($o->option_content_json), 'is_correct' => (bool) $o->is_correct, 'sort_order' => (int) $o->sort_order]));
        }
        $parts = $this->src->getSchemaBuilder()->hasTable('creative_question_parts') ? $this->src->table('creative_question_parts')->where('question_id', $src)->orderBy('sort_order')->get() : collect();
        foreach ($parts as $p) {
            if (!empty($p->parent_id)) { $this->skip('creative_question_parts', 'a nested part (only the first level comes over)'); continue; }
            $this->take('creative_question_parts', $p->id, 'qb_creative_parts', fn () => QbCreativePart::create(['qb_question_id' => $q, 'part_label' => mb_substr((string) $p->part_label, 0, 10),
                'cognitive_level' => self::COGNITIVE[$p->cognitive_level] ?? 'knowledge', 'marks' => $p->marks !== null ? $p->marks : '1.00',
                'question_text' => (string) $p->question_text, 'question_json' => $this->json($p->question_content_json),
                'answer_text' => $p->answer_text, 'answer_json' => $this->json($p->answer_content_json), 'sort_order' => (int) $p->sort_order]));
        }
        $name = fn (string $table, $id) => $id && $this->src->getSchemaBuilder()->hasTable($table) ? $this->src->table($table)->where('id', $id)->value('name_bn') : null;
        foreach ($this->src->table('question_occurrences')->where('question_id', $src)->get() as $oc) {
            $note = collect([$oc->exam_name, $oc->paper_name, $oc->question_number ? "#{$oc->question_number}" : null, $oc->source_title])->filter()->implode(' · ');
            QbQuestionOccurrence::create(['qb_question_id' => $q, 'board' => ($b = $name('boards', $oc->board_id)) ? mb_substr($b, 0, 50) : null,
                'institution_name' => ($i = $name('institutions', $oc->institution_id)) ? mb_substr($i, 0, 200) : null,
                'exam_type' => ($e = $name('exam_types', $oc->exam_type_id)) ? mb_substr($e, 0, 50) : null,
                'year' => $oc->exam_year, 'note' => $note !== '' ? mb_substr($note, 0, 200) : null]);
            $this->count('question_occurrences', 'new');
        }
        foreach (['question_items', 'question_stimuli', 'question_interactions'] as $t) {
            if ($this->src->getSchemaBuilder()->hasTable($t) && ($n = $this->src->table($t)->where('question_id', $src)->count())) {
                for ($k = 0; $k < $n; $k++) $this->skip($t, 'structured content is not imported yet');
            }
        }
    }

    // ---- pictures ----

    private function media(bool $dry): void
    {
        if (!$this->src->getSchemaBuilder()->hasTable('media_attachments')) return;
        $root = rtrim((string) $this->option('media-path'), '/');
        foreach ($this->src->table('media_attachments')->orderBy('id')->get() as $a) {
            $ownerType = self::OWNERS[$a->attachable_type] ?? null;
            $owner = $ownerType ? $this->target(['question' => 'questions', 'option' => 'question_options', 'creative_part' => 'creative_question_parts'][$ownerType], (int) $a->attachable_id) : null;
            if (!$owner) { $this->skip('media_attachments', $ownerType ? 'its owner was not imported' : "an owner kind not imported ({$a->attachable_type})"); continue; }
            $file = $this->src->table('media_files')->where('id', $a->media_file_id)->first();
            $media = $file ? $this->take('media_files', $file->id, 'qb_media', function () use ($file, $root, $dry) {
                $path = $root !== '' ? "{$root}/" . ltrim($file->file_path, '/') : null;
                if (!$path || !is_file($path)) { $this->skip('media_files', 'the file is not in --media-path'); return null; }
                $to = 'platform/qb/imported/' . basename($file->stored_name ?: $file->file_path);
                if (!$dry) Storage::disk('private')->put($to, file_get_contents($path));
                return QbMedia::create(['path' => $to, 'mime' => $file->mime_type, 'size_bytes' => (int) $file->file_size, 'uploaded_by' => $this->by]);
            }) : null;
            if ($media) QbMediaLink::firstOrCreate(['qb_media_id' => $media, 'owner_type' => $ownerType, 'owner_id' => $owner]);
        }
    }
}

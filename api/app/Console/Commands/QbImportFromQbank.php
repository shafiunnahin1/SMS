<?php

namespace App\Console\Commands;

use App\Models\{QbChapter, QbChapterClassLevel, QbClassLevel, QbClassLevelSubject, QbCreativePart, QbImportMap, QbMedia, QbMediaLink, QbQuestion,
    QbQuestionClassLevel, QbQuestionItem, QbQuestionOccurrence, QbQuestionOption, QbQuestionStimulus, QbQuestionType, QbSubject, QbTopic, User};
use App\Support\Money;
use Illuminate\Console\Command;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\{DB, Storage};

// QB.11 (D69, docs/modules/question-bank.md §6): brings the owner's qbank data over - curriculum, question types (matched by slug),
// questions with their class links, options, creative parts (the first level), occurrences and pictures. qb_import_map remembers
// every qbank row taken, so a second run takes nothing twice. Questions arrive as `review` (a moderator publishes them).
// --dry-run does the whole import inside a transaction and rolls it back (exact counts, nothing kept, no file copied).
// D70/D71: passages, items and interactions (fill gap / matching / rearranging / table) go into the existing stimuli / items in
// QB.4's shapes; an item without an answer comes without one (the publish check waits). A part with no usable data waits whole.
// Not taken (counted in the report): nested creative parts, item groups, question sets, OMR. Curriculum rows already here (the seed came from qbank) are matched by their Bengali name.
class QbImportFromQbank extends Command
{
    protected $signature = 'qb:import-from-qbank {--dry-run : count only, keep nothing} {--user= : the Super Admin the imported rows are written by}
        {--media-path= : the folder that holds qbank\'s stored files (its storage/app/public)} {--connection=qbank}
        {--refresh-text : re-clean the text of questions imported before (qbank editor HTML -> plain text) and move a passage kept in the question text into its passage}';
    protected $description = 'Import curriculum, questions and pictures from the qbank database (D69)';

    private Connection $src;
    private array $report = [];
    private array $skipped = [];
    private array $byType = [];
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
            if ($this->option('refresh-text')) $this->refreshText();
            $this->classLevels(); $this->subjects(); $this->chapters(); $this->topics(); $this->types(); $this->questions(); $this->media($dry);
            $dry ? DB::rollBack() : DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }
        $this->line($dry ? 'DRY RUN - nothing was kept.' : 'Imported.');
        $this->table(['what', 'new', 'matched to an existing row', 'imported before'], collect($this->report)->map(fn ($r, $k) => [$k, $r['new'] ?? 0, $r['matched'] ?? 0, $r['kept'] ?? 0])->values()->all());
        if ($this->byType) { arsort($this->byType); $this->table(['questions by type', 'new'], collect($this->byType)->map(fn ($n, $k) => [$k, $n])->values()->all()); }
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
        $this->count($table, $model->wasRecentlyCreated ? 'new' : 'matched');   // matched: a row already here (seed / type slug) took it
        return $model->id;
    }

    private function count(string $table, string $kind): void { $this->report[$table][$kind] = ($this->report[$table][$kind] ?? 0) + 1; }
    private function skip(string $what, string $why): void { $this->skipped["{$what}|{$why}"] = ($this->skipped["{$what}|{$why}"] ?? 0) + 1; }
    private function rows(string $table) { return $this->src->getSchemaBuilder()->hasTable($table) ? $this->src->table($table)->orderBy('id')->get() : collect(); }
    /** qbank stores its editor's HTML (and literal "\\n") in the *_text columns; here text is plain text - tags become line
     *  breaks / nothing, entities are decoded, never kept as markup (the pages render text, not HTML) */
    public static function plain(?string $v): ?string
    {
        if ($v === null) return null;
        $v = str_replace(['\\r\\n', '\\n', '\\r'], "\n", $v);
        $v = preg_replace('~<\s*br\s*/?>|</\s*(div|p|li|h[1-6]|tr)\s*>~i', "\n", $v);
        $v = html_entity_decode(strip_tags($v), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $v = preg_replace("~[ \t\x{00A0}]+~u", ' ', $v);
        return trim(preg_replace("~ *\n[ \n]*~", "\n", $v));
    }

    /** --refresh-text: the rows taken by an earlier run get the same cleaning (only rows this import made, via qb_import_map) */
    private function refreshText(): void
    {
        $maps = ['questions' => [QbQuestion::class, ['question_text', 'answer_text', 'explanation_text']],
            'question_options' => [QbQuestionOption::class, ['content_text']], 'creative_question_parts' => [QbCreativePart::class, ['question_text', 'answer_text']]];
        foreach ($maps as $table => [$model, $cols]) {
            $ids = QbImportMap::where('source', 'qbank')->where('source_table', $table)->pluck('target_id');
            foreach ($model::whereIn('id', $ids)->get() as $row) {
                foreach ($cols as $c) if ($row->{$c} !== null) $row->{$c} = self::plain($row->{$c}) ?? '';
                if ($row->isDirty()) { $row->save(); $this->count("{$table} (text cleaned)", 'kept'); }
                if ($row instanceof QbQuestion) $this->passageInText($row);
            }
        }
    }

    private function json($v) { return is_string($v) && $v !== '' ? json_decode($v, true) : (is_array($v) ? $v : null); }

    // ---- curriculum ----

    private function classLevels(): void
    {
        $levels = $this->src->getSchemaBuilder()->hasTable('education_levels') ? $this->src->table('education_levels')->pluck('slug', 'id') : collect();
        foreach ($this->rows('class_levels') as $r) {
            $slug = (string) ($levels[$r->education_level_id ?? 0] ?? '');
            $level = collect(self::LEVELS)->first(fn ($l) => str_contains(str_replace('-', '_', $slug), $l)) ?? 'other';
            $this->take('class_levels', $r->id, 'qb_class_levels', fn () => QbClassLevel::where('name_bn', $r->name_bn)->first() ?? QbClassLevel::create(['name_bn' => $r->name_bn, 'name_en' => $r->name_en ?: $r->name_bn,
                'education_level' => $level, 'sort_order' => (int) ($r->sort_order ?? 0), 'is_active' => (bool) ($r->is_active ?? true)]));
        }
    }

    private function subjects(): void
    {
        foreach ($this->rows('subjects') as $r) {
            $this->take('subjects', $r->id, 'qb_subjects', fn () => QbSubject::where('name_bn', $r->name_bn)->first() ?? QbSubject::create(['name_bn' => $r->name_bn, 'name_en' => $r->name_en ?: $r->name_bn,
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
            $plan = $this->structured($r);
            if (is_string($plan)) { $this->skip('questions', "has structured parts that do not fit ({$plan}) - not taken half-empty"); continue; }
            if ($why = $this->incomplete((int) $r->id, $type)) { $this->skip('questions', $why); continue; }
            $id = $this->take('questions', $r->id, 'qb_questions', fn () => QbQuestion::create([
                'qb_question_type_id' => $type, 'qb_subject_id' => $subject,
                'qb_chapter_id' => $r->chapter_id ? $this->target('chapters', (int) $r->chapter_id) : null,
                'qb_topic_id' => $r->topic_id ? $this->target('topics', (int) $r->topic_id) : null,
                'difficulty' => self::DIFFICULTY[$r->difficulty] ?? 3, 'marks' => is_numeric($r->marks) && Money::toPaisa((string) $r->marks) > 0 && Money::toPaisa((string) $r->marks) < 100000 ? Money::format(Money::toPaisa((string) $r->marks)) : '1.00',
                'language' => in_array($r->language, ['bn', 'en'], true) ? $r->language : 'bn',
                'content_mode' => ['plain_text' => 'plain_text', 'rich_math' => 'rich_math', 'mixed_content' => 'mixed', 'mixed' => 'mixed'][$r->content_mode] ?? 'plain_text',
                'question_text' => (string) self::plain($r->question_text), 'question_json' => $this->json($r->question_content_json),
                'answer_text' => self::plain($r->answer_text), 'answer_json' => $this->json($r->answer_content_json),
                'explanation_text' => self::plain($r->explanation_text), 'explanation_json' => $this->json($r->explanation_content_json),
                'status' => 'review', 'created_by' => $this->by]));
            $slug = QbQuestionType::whereKey($type)->value('slug');
            $this->byType[$slug] = ($this->byType[$slug] ?? 0) + 1;
            $this->children((int) $r->id, $id);
            $this->place($plan, $id);
            $this->passageInText(QbQuestion::find($id));
        }
    }

    /** A choice question needs at least two options and one right; a creative question needs its parts - otherwise it would
     *  arrive unusable (null = fine) */
    private function incomplete(int $src, int $type): ?string
    {
        $family = QbQuestionType::whereKey($type)->value('family');
        if (in_array($family, ['mcq', 'true_false'], true)) {
            $opts = $this->src->table('question_options')->where('question_id', $src);
            if ((clone $opts)->count() < 2 || !(clone $opts)->where('is_correct', true)->exists()) return 'a choice question without its options / right answer';
        }
        if ($family === 'creative' && (!$this->src->getSchemaBuilder()->hasTable('creative_question_parts')
            || !$this->src->table('creative_question_parts')->where('question_id', $src)->whereNull('parent_id')->exists())) return 'a creative question without its parts';
        return null;
    }

    // ---- structured parts (D70): into the existing stimuli / items, in QB.4's shapes ----

    /** The question's passage and items as QB.4 stores them, or the reason they do not fit (then the whole question waits).
     *  An interaction (fill gap / matching / rearranging) is the question's real answer key; qbank's question_items under it are
     *  only its projection, so they are not taken a second time. */
    private function structured(object $r): array|string
    {
        $schema = $this->src->getSchemaBuilder();
        $plan = ['stimuli' => [], 'items' => []];
        $sid = $schema->hasColumn('questions', 'question_stimulus_id') ? ($r->question_stimulus_id ?? null) : null;
        if ($sid) {
            $st = $schema->hasTable('question_stimuli') ? $this->src->table('question_stimuli')->where('id', $sid)->first() : null;
            if (!$st) return 'its passage is missing';
            $plan['stimuli'][] = ['label' => ($l = $st->title ?? $st->stimulus_type ?? null) ? mb_substr((string) $l, 0, 50) : null,
                'content_text' => self::plain($st->content_text ?? null), 'content_json' => $this->json($st->content_json ?? null)];
        }
        $passage = $plan['stimuli'] ? 0 : null;
        $interaction = $schema->hasTable('question_interactions') ? $this->src->table('question_interactions')->where('question_id', $r->id)->first() : null;
        if ($interaction) {
            $items = $this->interaction($interaction, $passage, $plan);
            if (is_string($items)) return $items;
            $plan['items'] = $items;
            return $plan;
        }
        $rows = $schema->hasTable('question_items') ? $this->src->table('question_items')->where('question_id', $r->id)->orderBy('sort_order')->orderBy('id')->get() : collect();
        foreach ($rows as $it) {
            $opts = $schema->hasTable('question_item_options') ? $this->src->table('question_item_options')->where('question_item_id', $it->id)->orderBy('sort_order')->orderBy('id')->get() : collect();
            $prompt = self::plain($it->prompt_text ?? null);
            $marks = isset($it->marks) && is_numeric($it->marks) ? $it->marks : 0;
            if ($opts->count() >= 2 && $opts->where('is_correct', true)->count() === 1) {
                $plan['items'][] = ['item_type' => 'sub_mcq', 'stimulus' => $passage, 'prompt_text' => $prompt, 'marks' => $marks,
                    'prompt_json' => ['options' => $opts->map(fn ($o) => self::plain($o->option_text) ?? '')->values()->all()],
                    'answer_json' => ['correct' => $opts->values()->search(fn ($o) => (bool) $o->is_correct)]];
            } elseif (($ans = self::plain($it->answer_text ?? null)) !== null && $ans !== '' && $prompt) {
                $plan['items'][] = ['item_type' => 'sub_question', 'stimulus' => $passage, 'prompt_text' => $prompt, 'marks' => $marks, 'prompt_json' => null, 'answer_json' => ['answer_text' => $ans]];
            } elseif ($prompt) {                                    // D71: comes without an answer; the publish check waits for one
                $plan['items'][] = ['item_type' => 'sub_question', 'stimulus' => $passage, 'prompt_text' => $prompt, 'marks' => $marks, 'prompt_json' => null, 'answer_json' => ['answer_text' => null]];
                $this->skip('question_items', 'imported without an answer - a moderator adds it before publishing');
            } else {
                return 'an item with neither text nor answer';
            }
        }
        return $plan;
    }

    /** qbank's interaction definition -> QB.4 items: gaps (answers = the primary + its aliases), rearranging -> order steps,
     *  two-sided matching -> pairs. A word box of clues becomes a stimulus. A table becomes a stimulus with a gap per answer cell; column matching joins each row's matches (D71). */
    private function interaction(object $in, ?int $passage, array &$plan): array|string
    {
        $def = $this->json($in->definition_json) ?? [];
        $type = (string) ($def['type'] ?? $in->interaction_type);
        $itemIds = $this->src->getSchemaBuilder()->hasTable('question_interaction_entities')
            ? $this->src->table('question_interaction_entities')->where('question_interaction_id', $in->id)->pluck('question_item_id', 'logical_key') : collect();
        $textOf = fn ($key) => ($id = $itemIds[$key] ?? null) ? self::plain($this->src->table('question_items')->where('id', $id)->value('prompt_text')) : null;
        $txt = fn ($v) => self::plain(is_array($v) ? (string) ($v['text'] ?? $v['label'] ?? $v['content'] ?? '') : (string) $v);
        $items = [];
        switch ($type) {
            case 'fill_gap_with_clue':
            case 'fill_gap_without_clue':
                $gaps = $def['answer_key']['gaps'] ?? [];
                if (!is_array($gaps) || !$gaps) return 'a fill-gap without gaps';
                $order = array_values(array_filter((array) ($def['presentation']['entity_order'] ?? []), fn ($k) => isset($gaps[$k])));
                foreach ($order ?: array_keys($gaps) as $k) {
                    $answers = array_values(array_filter(array_map(fn ($a) => trim((string) $a), [$gaps[$k]['primary'] ?? '', ...(array) ($gaps[$k]['aliases'] ?? [])]), fn ($a) => $a !== ''));
                    if (!$answers) return 'a gap without its answer';
                    $items[] = ['item_type' => 'gap', 'stimulus' => $passage, 'prompt_text' => $textOf($k), 'prompt_json' => null, 'answer_json' => ['answers' => $answers],
                        'marks' => $def['scoring']['gaps'][$k]['marks'] ?? 0];
                }
                $clues = array_values(array_filter(array_map($txt, (array) ($def['content']['clues'] ?? []))));
                if ($clues) $plan['stimuli'][] = ['label' => 'clues', 'content_text' => implode(' / ', $clues), 'content_json' => null];
                return $items;
            case 'rearranging':
                $order = (array) ($def['answer_key']['correct_order'] ?? []);
                if (count($order) < 2) return 'a rearranging without its order';
                foreach ($order as $i => $k) {
                    if (!($t = $textOf($k))) return 'a rearranging step without text';
                    $items[] = ['item_type' => 'order_step', 'stimulus' => $passage, 'prompt_text' => $t, 'prompt_json' => null, 'answer_json' => ['position' => $i + 1], 'marks' => 0];
                }
                return $items;
            case 'matching':
                $m = $def['content']['matching'] ?? [];
                if (is_array($m['columns'] ?? null)) {                 // D71: the first column's rows; the right side = the other columns' matches together
                    $cols = array_values($m['columns']);
                    $opt = collect(array_slice($cols, 1))->flatMap(fn ($c) => $c['options'] ?? [])->mapWithKeys(fn ($o) => [(string) ($o['key'] ?? '') => $txt($o)]);
                    foreach ($cols[0]['options'] ?? [] as $l) {
                        $right = collect((array) ($def['answer_key']['matches'][$l['key'] ?? ''] ?? []))->map(fn ($k) => $opt[(string) $k] ?? null);
                        if (!($t = $txt($l)) || $right->isEmpty() || $right->contains(null)) return 'a matching row without its matches';
                        $items[] = ['item_type' => 'match_pair', 'stimulus' => $passage, 'prompt_text' => $t, 'prompt_json' => null, 'answer_json' => ['right' => $right->implode(' — ')], 'marks' => 0];
                    }
                    return count($items) >= 2 ? $items : 'a matching with fewer than two rows';
                }
                if (!is_array($m['left'] ?? null) || !is_array($m['right'] ?? null)) return 'a matching without sides';
                $right = collect($m['right'])->mapWithKeys(fn ($x) => [(string) ($x['key'] ?? '') => $txt($x)]);
                foreach ($m['left'] as $l) {
                    $to = $def['answer_key']['matches'][$l['key'] ?? ''] ?? null;
                    $to = is_array($to) ? ($to[0] ?? null) : $to;
                    if (!($t = $txt($l)) || !($r = $right[(string) $to] ?? null)) return 'a matching pair without both sides';
                    $items[] = ['item_type' => 'match_pair', 'stimulus' => $passage, 'prompt_text' => $t, 'prompt_json' => null, 'answer_json' => ['right' => $r], 'marks' => 0];
                }
                return count($items) >= 2 ? $items : 'a matching with fewer than two pairs';
            case 'table_completion':                                 // D71: the table (no answers) is a stimulus; each answer cell a gap
                $tbl = $def['content']['table'] ?? [];
                $heads = array_map(fn ($c) => trim((string) ($c['header'] ?? '')), (array) ($tbl['columns'] ?? []));
                $cells = (array) ($def['answer_key']['cells'] ?? []);
                $lines = $heads && array_filter($heads) ? [implode(' | ', $heads)] : [];
                $n = 0;
                foreach ((array) ($tbl['rows'] ?? []) as $row) {
                    $out = [];
                    $rowName = collect($row['cells'] ?? [])->first(fn ($c) => ($c['kind'] ?? '') === 'fixed')['text'] ?? '';
                    foreach (array_values((array) ($row['cells'] ?? [])) as $ci => $c) {
                        if (($c['kind'] ?? '') !== 'answerable') { $out[] = self::plain((string) ($c['text'] ?? '')); continue; }
                        $ans = trim((string) ($cells[$c['cell_key'] ?? '']['primary'] ?? ''));
                        if ($ans === '') return 'a table cell without its answer';
                        $label = '(' . (++$n) . ')';
                        $out[] = "{$label} ___";
                        $items[] = ['item_type' => 'gap', 'stimulus' => count($plan['stimuli']), 'prompt_text' => trim("{$label} " . self::plain((string) $rowName) . (($heads[$ci] ?? '') !== '' ? " — {$heads[$ci]}" : '')),
                            'prompt_json' => null, 'answer_json' => ['answers' => [$ans]], 'marks' => $def['scoring']['cells'][$c['cell_key']]['marks'] ?? 0];
                    }
                    $lines[] = implode(' | ', $out);
                }
                if (!$items) return 'a table without answer cells';
                $plan['stimuli'][] = ['label' => 'table', 'content_text' => implode("\n", $lines), 'content_json' => ['table' => $tbl]];   // cells carry keys, never answers
                return $items;
            default:
                return "interaction {$type}";
        }
    }

    /** A passage type whose passage qbank kept in the question text (no stimulus): the text becomes the passage, the question
     *  text the type's name, and its items hang on the passage - as the QB.4 editor and its review check expect. */
    private function passageInText(QbQuestion $q): bool
    {
        $type = QbQuestionType::find($q->qb_question_type_id);
        if (!in_array($type?->ui_config['structure'] ?? null, ['passage', 'passage_mcq'], true) || QbQuestionStimulus::where('qb_question_id', $q->id)->exists()) return false;
        if (trim((string) $q->question_text) === '') return false;
        $st = QbQuestionStimulus::create(['qb_question_id' => $q->id, 'label' => 'passage', 'content_text' => $q->question_text, 'content_json' => null, 'sort_order' => 0]);
        QbQuestionItem::where('qb_question_id', $q->id)->whereNull('qb_question_stimulus_id')->update(['qb_question_stimulus_id' => $st->id]);
        $q->forceFill(['question_text' => $q->language === 'en' ? ($type->name_en ?: $type->name_bn) : $type->name_bn, 'question_json' => null])->save();
        $this->count('question_stimuli (passage moved out of the question text)', 'new');
        return true;
    }

    private function place(array $plan, int $q): void
    {
        $ids = [];
        foreach ($plan['stimuli'] as $i => $st) {
            $ids[$i] = QbQuestionStimulus::create(['qb_question_id' => $q, 'sort_order' => $i] + $st)->id;
            $this->count('question_stimuli', 'new');
        }
        foreach ($plan['items'] as $i => $it) {
            QbQuestionItem::create(['qb_question_id' => $q, 'qb_question_stimulus_id' => $it['stimulus'] !== null ? $ids[$it['stimulus']] : null, 'item_type' => $it['item_type'],
                'prompt_text' => $it['prompt_text'], 'prompt_json' => $it['prompt_json'], 'answer_json' => $it['answer_json'],
                'marks' => is_numeric($it['marks']) ? $it['marks'] : 0, 'sort_order' => $i]);
            $this->count('question_items', 'new');
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
                'content_text' => (string) self::plain($o->option_text), 'content_json' => $this->json($o->option_content_json), 'is_correct' => (bool) $o->is_correct, 'sort_order' => (int) $o->sort_order]));
        }
        $parts = $this->src->getSchemaBuilder()->hasTable('creative_question_parts') ? $this->src->table('creative_question_parts')->where('question_id', $src)->orderBy('sort_order')->get() : collect();
        foreach ($parts as $p) {
            if (!empty($p->parent_id)) { $this->skip('creative_question_parts', 'a nested part (only the first level comes over)'); continue; }
            $this->take('creative_question_parts', $p->id, 'qb_creative_parts', fn () => QbCreativePart::create(['qb_question_id' => $q, 'part_label' => mb_substr((string) $p->part_label, 0, 10),
                'cognitive_level' => self::COGNITIVE[$p->cognitive_level] ?? 'knowledge', 'marks' => $p->marks !== null ? $p->marks : '1.00',
                'question_text' => (string) self::plain($p->question_text), 'question_json' => $this->json($p->question_content_json),
                'answer_text' => self::plain($p->answer_text), 'answer_json' => $this->json($p->answer_content_json), 'sort_order' => (int) $p->sort_order]));
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

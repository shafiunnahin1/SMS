<?php

namespace App\Services;

use App\Http\Requests\QuestionBank\QbQuestionRequest;
use App\Models\QbChapter;
use App\Models\QbClassLevel;
use App\Models\QbQuestionType;
use App\Models\QbSubject;
use App\Models\QbTopic;
use Illuminate\Support\Facades\Validator;

// D123 (R2.1.3): one imported record (qbank's JSON v5 or SMS's own keys; JSON and TOON decode to the same array) ->
// the canonical staged record, which is exactly the body the question editor saves plus the curriculum by name, the
// figure notes and the source. Every type in qb_question_types is accepted; an unknown type, a part its structure cannot
// hold, an unknown subject/chapter/topic/class or a field the editor's own rules refuse becomes a field-path error - the record
// stays staged, nothing is guessed or flattened. Text is taken exactly as decoded (no LaTeX "repair").
class QbImportNormalizer
{
    /** qbank's own type words (AiJsonImportService::normaliseTypeSlug) for the six it knew */
    private const ALIASES = ['multiple_choice' => 'mcq', 'multiple_choice_question' => 'mcq', 'cq' => 'creative', 'creative_question' => 'creative',
        'short_answer' => 'short', 'short_question' => 'short', 'knowledge_based' => 'knowledge', 'understanding_based' => 'understanding',
        'comprehension' => 'understanding', 'broad' => 'descriptive', 'broad_question' => 'descriptive', 'essay' => 'descriptive',
        'বহুনির্বাচনী' => 'mcq', 'সৃজনশীল' => 'creative', 'সংক্ষিপ্ত' => 'short', 'জ্ঞানমূলক' => 'knowledge', 'অনুধাবনমূলক' => 'understanding', 'রচনামূলক' => 'descriptive'];
    private const DIFFICULTY_WORDS = ['very_easy' => 1, 'easy' => 2, 'medium' => 3, 'normal' => 3, 'hard' => 4, 'very_hard' => 5,
        'সহজ' => 2, 'মধ্যম' => 3, 'কঠিন' => 4];
    private const LEVELS = ['knowledge', 'understanding', 'application', 'higher_order'];
    private const LEVEL_WORDS = ['জ্ঞানমূলক' => 'knowledge', 'অনুধাবনমূলক' => 'understanding', 'প্রয়োগমূলক' => 'application', 'উচ্চতর দক্ষতা' => 'higher_order',
        'উচ্চতর দক্ষতামূলক' => 'higher_order', 'higher order' => 'higher_order', 'comprehension' => 'understanding'];
    private const CREATIVE_LABELS = ['ক', 'খ', 'গ', 'ঘ'];
    private const DEFAULT_LEVELS = ['knowledge', 'understanding', 'application', 'higher_order'];

    private ?array $types = null;
    private ?array $subjects = null;
    private array $chapters = [];
    private array $topics = [];
    private ?array $classes = null;
    private ?array $rules = null;

    /**
     * @return array{payload: array, errors: list<array{path:string,message:string}>, warnings: list<string>, type_slug: ?string, has_math: bool}
     */
    public function normalize(array $raw, array $document = []): array
    {
        $errors = [];
        $warnings = [];
        $err = function (string $path, string $message) use (&$errors) { $errors[] = ['path' => $path, 'message' => $message]; };
        $settings = is_array($raw['settings'] ?? null) ? $raw['settings'] : [];
        $pick = fn (string ...$keys) => $this->first($raw, $settings, $keys);

        // type
        $typeWord = $pick('type', 'question_type', 'type_slug');
        $type = is_scalar($typeWord) ? $this->type((string) $typeWord) : null;
        if ($typeWord === null || $typeWord === '') $err('question_type', 'the question type is missing');
        elseif (!$type) $err('question_type', "unknown question type \"{$this->str($typeWord)}\"");

        // text (exactly as decoded)
        $structure = $type['structure'] ?? null;
        $family = $type['family'] ?? null;
        $question = $this->text($raw, ['question_text', 'text']);
        $stimulus = $this->text($raw, ['stimulus_text']);
        if ($family === 'creative' && $stimulus !== null) {                  // SMS keeps a creative question's উদ্দীপক in question_text
            $question = $question !== null && $question !== '' ? $stimulus . "\n\n" . $question : $stimulus;
            $stimulus = null;
        }
        $payload = [
            'type' => $type['slug'] ?? $this->str($typeWord),
            'question_text' => $question ?? '',
            'answer_text' => $this->text($raw, ['answer_text', 'answer']),
            'explanation_text' => $this->text($raw, ['explanation_text', 'explanation']),
            'language' => $this->language($pick('language') ?? ($document['language'] ?? null), $warnings),
            'difficulty' => $this->difficulty($pick('difficulty'), $warnings),
            'marks' => $this->marks($pick('marks'), $err),
            'subject' => $this->ref($pick('subject')),
            'chapter' => $this->ref($pick('chapter')),
            'topic' => $this->ref($pick('topic')),
            'class_levels' => array_values(array_filter(array_map(fn ($c) => $this->ref($c), $this->list($pick('class_levels', 'classes'))), fn ($c) => $c !== null)),
        ];
        if (($payload['question_text'] ?? '') === '' && !in_array($structure, ['gap', 'match', 'order'], true)) $err('question_text', 'the question text is empty');

        // the parts the type's structure holds
        $options = $this->list($raw['options'] ?? null);
        $parts = $this->list($raw['creative_parts'] ?? null);
        $stimuli = $this->list($raw['stimuli'] ?? null);
        $items = $this->list($raw['items'] ?? null);
        if ($stimulus !== null && $stimulus !== '' && $stimuli === []) $stimuli = [['label' => 'stimulus', 'content_text' => $stimulus]];
        $holds = $this->holds($structure, $family);
        foreach (['options' => $options, 'creative_parts' => $parts, 'stimuli' => $stimuli, 'items' => $items] as $key => $list) {
            if ($list !== [] && !in_array($key, $holds, true) && $type) $err($key, "a \"{$type['slug']}\" question cannot have {$key}");
        }
        if (in_array('options', $holds, true)) $payload['options'] = array_map(fn ($o, $i) => [
            'label' => $this->str($o['label'] ?? '') ?: (string) ($i + 1),
            'content_text' => $this->str($o['content_text'] ?? $o['text'] ?? ''),
            'is_correct' => filter_var($o['is_correct'] ?? false, FILTER_VALIDATE_BOOL)], $options, array_keys($options));
        if (in_array('creative_parts', $holds, true)) $payload['creative_parts'] = array_map(fn ($p, $i) => array_filter([
            'part_label' => $this->str($p['part_label'] ?? $p['label'] ?? '') ?: (self::CREATIVE_LABELS[$i] ?? (string) ($i + 1)),
            'cognitive_level' => $this->level($p['cognitive_level'] ?? null) ?? (self::DEFAULT_LEVELS[$i] ?? null),
            'marks' => $p['marks'] ?? null,
            'question_text' => $this->str($p['question_text'] ?? $p['text'] ?? ''),
            'answer_text' => isset($p['answer_text']) ? $this->str($p['answer_text']) : null,
        ], fn ($v) => $v !== null), $parts, array_keys($parts));
        if (in_array('stimuli', $holds, true)) $payload['stimuli'] = array_map(fn ($s) => ['label' => isset($s['label']) ? $this->str($s['label']) : null,
            'content_text' => $this->str($s['content_text'] ?? $s['text'] ?? '')], $stimuli);
        if (in_array('items', $holds, true)) $payload['items'] = array_map(fn ($it) => array_intersect_key($it, array_flip(['item_type', 'stimulus_index', 'prompt_text', 'prompt_json', 'answer_json', 'marks'])), $items);
        $this->structureErrors($structure, $family, $payload, $err);
        $payload['occurrences'] = array_values(array_filter(array_map(fn ($o) => is_array($o) ? array_intersect_key($o, array_flip(['board', 'institution_name', 'exam_type', 'year', 'note'])) : null,
            $this->list($pick('occurrences')))));

        // kept with the record for the reviewer; the editor does not take them
        foreach (['figure_descriptions', 'visuals', 'source'] as $k) if (!empty($raw[$k])) $payload[$k] = $raw[$k];
        $payload = array_filter($payload, fn ($v) => $v !== null);

        // the curriculum and the editor's own rules
        $body = $this->editorBody($payload, $err);
        if ($type) {
            $v = Validator::make($body, $this->rules());
            foreach ($v->errors()->messages() as $field => $messages) {
                if (in_array($field, ['qb_subject_id', 'qb_chapter_id', 'qb_topic_id', 'qb_question_type_id'], true)) continue;   // named above, by name
                if (in_array($field, array_column($errors, 'path'), true)) continue;   // already said, in the import's words
                $err($field, $messages[0]);
            }
        }

        return ['payload' => $payload, 'errors' => $errors, 'warnings' => $warnings, 'type_slug' => $type['slug'] ?? null,
            'has_math' => (bool) preg_match('/\\\\\(|\\\\\[|\$[^$]+\$|\\\\frac|\\\\sqrt/', json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))];
    }

    /** the staged record -> the question editor's POST body (ids resolved); an unknown name is a field-path error */
    public function editorBody(array $payload, ?callable $err = null): array
    {
        $err ??= fn () => null;
        $type = $this->type((string) ($payload['type'] ?? ''));
        $subject = $this->subject($payload['subject'] ?? null);
        if (($payload['subject'] ?? null) === null) $err('subject', 'the subject is missing');
        elseif (!$subject) $err('subject', 'no such subject: ' . $this->label($payload['subject']));
        $chapter = $subject ? $this->chapter($subject, $payload['chapter'] ?? null) : null;
        if (($payload['chapter'] ?? null) !== null && $subject && !$chapter) $err('chapter', 'no such chapter in this subject: ' . $this->label($payload['chapter']));
        $topic = $chapter ? $this->topic($chapter, $payload['topic'] ?? null) : null;
        if (($payload['topic'] ?? null) !== null && $chapter && !$topic) $err('topic', 'no such topic in this chapter: ' . $this->label($payload['topic']));
        $classes = [];
        foreach ($payload['class_levels'] ?? [] as $i => $c) {
            $id = $this->classLevel($c);
            if ($id) $classes[] = $id; else $err("class_levels.{$i}", 'no such class: ' . $this->label($c));
        }
        $body = ['qb_question_type_id' => $type['id'] ?? null, 'qb_subject_id' => $subject, 'qb_chapter_id' => $chapter, 'qb_topic_id' => $topic,
            'question_text' => $payload['question_text'] ?? '', 'class_level_ids' => array_values(array_unique($classes))];
        foreach (['answer_text', 'explanation_text', 'difficulty', 'marks', 'options', 'creative_parts', 'stimuli', 'items', 'occurrences'] as $k) {
            if (array_key_exists($k, $payload)) $body[$k] = $payload[$k];
        }
        return $body;
    }

    /** the editor's create rules (QbQuestionRequest) minus the fields the import never sends */
    private function rules(): array
    {
        if ($this->rules === null) {
            $request = new QbQuestionRequest;
            $request->setMethod('POST');
            $this->rules = array_diff_key($request->rules(), array_flip(['language', 'content_mode', 'status']));
        }
        return $this->rules;
    }

    /** which child lists a type's structure / family holds (as the editor saves it) */
    private function holds(?string $structure, ?string $family): array
    {
        return match ($structure) {
            'gap', 'match', 'order' => ['items'],
            'passage', 'passage_mcq' => ['stimuli', 'items'],
            default => match ($family) { 'mcq', 'true_false' => ['options'], 'creative' => ['creative_parts'], default => [] },
        };
    }

    private function structureErrors(?string $structure, ?string $family, array $p, callable $err): void
    {
        $items = $p['items'] ?? [];
        $kinds = array_column($items, 'item_type');
        $need = fn (string $kind, int $min, string $what) => count(array_filter($kinds, fn ($k) => $k === $kind)) >= $min ?: $err('items', "needs at least {$min} {$what}");
        match ($structure) {
            'gap' => $need('gap', 1, 'gap'),
            'match' => $need('match_pair', 2, 'pairs'),
            'order' => $need('order_step', 2, 'steps'),
            'passage' => [($p['stimuli'] ?? []) !== [] ?: $err('stimuli', 'needs the passage'), $need('sub_question', 1, 'question')],
            'passage_mcq' => [($p['stimuli'] ?? []) !== [] ?: $err('stimuli', 'needs the stimulus'), $need('sub_mcq', 1, 'question')],
            default => null,
        };
        if ($structure === null && in_array($family, ['mcq', 'true_false'], true)) {
            $opts = $p['options'] ?? [];
            if (count($opts) < 2) $err('options', 'needs at least 2 options');
            elseif (!array_filter(array_column($opts, 'is_correct'))) $err('options', 'no option is marked correct');
        }
        if ($structure === null && $family === 'creative' && ($p['creative_parts'] ?? []) === []) $err('creative_parts', 'needs at least one part (ক-ঘ)');
        foreach ($p['creative_parts'] ?? [] as $i => $part) {
            if (!isset($part['cognitive_level'])) $err("creative_parts.{$i}.cognitive_level", 'unknown cognitive level');
        }
    }

    private function type(string $word): ?array
    {
        $this->types ??= QbQuestionType::where('is_active', true)->get(['id', 'slug', 'name_bn', 'name_en', 'family', 'ui_config'])
            ->map(fn ($t) => ['id' => $t->id, 'slug' => $t->slug, 'family' => $t->family, 'structure' => $t->ui_config['structure'] ?? null,
                'keys' => array_unique(array_filter([$this->key($t->slug), $this->key((string) $t->name_bn), $this->key((string) $t->name_en)]))])->all();
        $k = $this->key($word);
        $k = self::ALIASES[$k] ?? $k;
        foreach ($this->types as $t) if (in_array($k, $t['keys'], true)) return $t;
        return null;
    }

    private function subject(mixed $ref): ?int
    {
        $this->subjects ??= QbSubject::get(['id', 'name_bn', 'name_en'])->map(fn ($s) => $s->only(['id', 'name_bn', 'name_en']))->all();
        return $this->match($this->subjects, $ref);
    }

    private function chapter(int $subject, mixed $ref): ?int
    {
        if ($ref === null) return null;
        $this->chapters[$subject] ??= QbChapter::where('qb_subject_id', $subject)->get(['id', 'name_bn', 'name_en'])->map(fn ($c) => $c->only(['id', 'name_bn', 'name_en']))->all();
        return $this->match($this->chapters[$subject], $ref);
    }

    private function topic(int $chapter, mixed $ref): ?int
    {
        if ($ref === null) return null;
        $this->topics[$chapter] ??= QbTopic::where('qb_chapter_id', $chapter)->get(['id', 'name_bn', 'name_en'])->map(fn ($t) => $t->only(['id', 'name_bn', 'name_en']))->all();
        return $this->match($this->topics[$chapter], $ref);
    }

    private function classLevel(mixed $ref): ?int
    {
        $this->classes ??= QbClassLevel::get(['id', 'name_bn', 'name_en'])->map(fn ($c) => $c->only(['id', 'name_bn', 'name_en']))->all();
        return $this->match($this->classes, $ref);
    }

    /** a ref is {"id": n} or {"name": "..."} (either language), or a bare name / id */
    private function match(array $rows, mixed $ref): ?int
    {
        if ($ref === null) return null;
        $id = is_array($ref) ? ($ref['id'] ?? null) : (is_int($ref) ? $ref : null);
        if ($id !== null) return collect($rows)->firstWhere('id', (int) $id)['id'] ?? null;
        $name = $this->key(is_array($ref) ? (string) ($ref['name'] ?? $ref['name_bn'] ?? $ref['name_en'] ?? '') : (string) $ref);
        foreach ($rows as $r) if ($name !== '' && ($this->key((string) $r['name_bn']) === $name || $this->key((string) $r['name_en']) === $name)) return $r['id'];
        return null;
    }

    private function ref(mixed $v): mixed
    {
        if ($v === null || $v === '' || $v === []) return null;
        if (is_array($v)) {
            if (isset($v['id'])) return ['id' => (int) $v['id']];
            $name = $v['name'] ?? $v['name_bn'] ?? $v['name_en'] ?? null;
            return $name === null || $name === '' ? null : ['name' => $this->str($name)];
        }
        return is_int($v) ? ['id' => $v] : ['name' => $this->str($v)];
    }

    private function label(mixed $ref): string
    {
        return is_array($ref) ? (string) ($ref['name'] ?? ('#' . ($ref['id'] ?? '?'))) : (string) $ref;
    }

    private function language(mixed $v, array &$warnings): string
    {
        $k = $this->key((string) $v);
        return match (true) {
            in_array($k, ['bn', 'bangla', 'bengali', 'বাংলা'], true) => 'bn',
            in_array($k, ['en', 'english', 'ইংরেজি'], true) => 'en',
            in_array($k, ['', 'und', 'mixed', 'both'], true) => 'und',
            default => (function () use ($v, &$warnings) { $warnings[] = "unknown language \"{$this->str($v)}\" - kept as mixed"; return 'und'; })(),
        };
    }

    private function difficulty(mixed $v, array &$warnings): int
    {
        if ($v === null || $v === '') return 3;
        if (is_numeric($v) && (int) $v == $v && $v >= 1 && $v <= 5) return (int) $v;
        $word = self::DIFFICULTY_WORDS[$this->key((string) $v)] ?? null;
        if ($word) return $word;
        $warnings[] = "unknown difficulty \"{$this->str($v)}\" - set to 3";
        return 3;
    }

    private function marks(mixed $v, callable $err): ?string
    {
        if ($v === null || $v === '') return null;
        if (!is_numeric($v)) { $err('marks', 'marks must be a number'); return null; }
        return (string) $v;
    }

    private function level(mixed $v): ?string
    {
        if ($v === null || $v === '') return null;
        $k = $this->key((string) $v);
        if (in_array($k, self::LEVELS, true)) return $k;
        foreach (self::LEVEL_WORDS as $word => $level) if ($this->key($word) === $k) return $level;
        return null;
    }

    private function text(array $raw, array $keys): ?string
    {
        foreach ($keys as $k) if (array_key_exists($k, $raw) && $raw[$k] !== null) return $this->str($raw[$k]);
        return null;
    }

    private function first(array $raw, array $settings, array $keys): mixed
    {
        foreach ($keys as $k) {
            if (array_key_exists($k, $settings) && $settings[$k] !== null && $settings[$k] !== '') return $settings[$k];
            if (array_key_exists($k, $raw) && $raw[$k] !== null && $raw[$k] !== '') return $raw[$k];
        }
        return null;
    }

    private function list(mixed $v): array
    {
        if (!is_array($v)) return [];
        return array_values(array_filter(array_is_list($v) ? $v : [$v], fn ($x) => $x !== null));
    }

    private function str(mixed $v): string
    {
        return is_scalar($v) ? (string) $v : (is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : '');
    }

    /** case- and separator-insensitive comparison key */
    private function key(string $s): string
    {
        return trim(preg_replace('/[\s\-_]+/u', '_', mb_strtolower(trim($s))), '_');
    }
}

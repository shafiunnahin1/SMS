<?php

namespace App\Http\Controllers\QuestionBank;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Http\Requests\QuestionBank\QbCurriculumRequest;
use App\Models\{AuditLog, Program, QbChapter, QbClassLevel, QbConcept, QbQuestion, QbResource, QbSubject, QbTopic};
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

// QB.1 (D65, docs/modules/question-bank.md §3ক): the platform curriculum class → subject → chapter → topic. The Super Admin
// edits it on the central host (`tenancy.bypass`); an institution's admin only lists the active classes, to link a program.
// A node is never deleted while anything hangs on it (422 `qb_in_use`): its children, questions, concepts, resources, programs.
class QbCurriculumController extends Controller
{
    public const KINDS = ['class-levels' => QbClassLevel::class, 'subjects' => QbSubject::class, 'chapters' => QbChapter::class, 'topics' => QbTopic::class];
    public const EDUCATION_LEVELS = ['primary', 'secondary', 'higher_secondary', 'madrasa', 'technical', 'admission', 'other'];

    /** GET /super/qb/curriculum: the whole tree in one answer (a few hundred rows at most) */
    public function tree()
    {
        return response()->json(['success' => true, 'data' => self::treeData()]);
    }

    /** The tree itself - also served to the writers' panel (QbQuestionController@curriculum, QB.2) */
    public static function treeData(): array
    {
        $topics = QbTopic::orderBy('sort_order')->orderBy('id')->get()->groupBy('qb_chapter_id');
        $chapters = QbChapter::with('classLevels:id')->orderBy('sort_order')->orderBy('number')->orderBy('id')->get()->groupBy('qb_subject_id');
        $self = new self;
        return [
            'class_levels' => QbClassLevel::orderBy('sort_order')->orderBy('id')->get()->map(fn ($c) => $self->row('class-levels', $c))->values(),
            'subjects' => QbSubject::with('classLevels:id')->orderBy('sort_order')->orderBy('id')->get()->map(fn ($s) => $self->row('subjects', $s) + [
                'class_level_ids' => $s->classLevels->pluck('id')->values(),
                'chapters' => ($chapters[$s->id] ?? collect())->map(fn ($ch) => $self->row('chapters', $ch) + [
                    'class_level_ids' => $ch->classLevels->pluck('id')->values(),
                    'topics' => ($topics[$ch->id] ?? collect())->map(fn ($t) => $self->row('topics', $t))->values(),
                ])->values(),
            ])->values(),
            'education_levels' => self::EDUCATION_LEVELS,
        ];
    }

    /** POST /super/qb/{kind} */
    public function store(QbCurriculumRequest $request, string $kind)
    {
        $this->kind($kind);
        $in = $request->validated();
        $node = DB::transaction(function () use ($kind, $in) {
            $class = self::KINDS[$kind];
            $node = $class::create(collect($in)->except('class_level_ids')->all());
            $this->syncClasses($kind, $node, $in);
            AuditLog::record("qb.{$kind}.created", $node);
            return $node;
        });
        return response()->json(['success' => true, 'data' => $this->row($kind, $node->fresh()), 'message' => __('messages.saved')], 201);
    }

    /** PUT /super/qb/{kind}/{id} */
    public function update(QbCurriculumRequest $request, string $kind, int $id)
    {
        $node = $this->find($kind, $id);
        $in = $request->validated();
        DB::transaction(function () use ($kind, $node, $in) {
            $node->update(collect($in)->except('class_level_ids')->all());
            $this->syncClasses($kind, $node, $in);
            AuditLog::record("qb.{$kind}.updated", $node, ['changed' => array_keys($in)]);
        });
        return response()->json(['success' => true, 'data' => $this->row($kind, $node->fresh()), 'message' => __('messages.saved')]);
    }

    /** DELETE /super/qb/{kind}/{id}: only an empty node (turn a class or subject off with is_active instead) */
    public function destroy(string $kind, int $id)
    {
        $this->kind($kind);
        $node = $this->find($kind, $id);
        if ($this->inUse($kind, $node)) throw new BusinessException('this curriculum node is in use', 'qb_in_use', 422);
        DB::transaction(function () use ($kind, $node) {
            if ($kind === 'class-levels') $node->chapters()->detach();             // a class only links chapters once nothing else uses it
            if (in_array($kind, ['subjects', 'chapters'], true)) $node->classLevels()->detach();
            AuditLog::record("qb.{$kind}.deleted", $node, ['name_en' => $node->name_en]);
            $node->delete();
        });
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** GET /qb/class-levels (institution admin, module question_bank): the active classes, to link a program */
    public function classLevels()
    {
        return response()->json(['success' => true, 'data' => QbClassLevel::where('is_active', true)->orderBy('sort_order')->orderBy('id')
            ->get()->map(fn ($c) => ['id' => $c->id, 'name_bn' => $c->name_bn, 'name_en' => $c->name_en, 'education_level' => $c->education_level])->values()]);
    }

    /** an unknown {kind} is a 404 - checked here, after the role middleware, so another role still gets its 403 */
    private function kind(string $kind): void
    {
        abort_unless(isset(self::KINDS[$kind]), 404);
    }

    private function find(string $kind, int $id): Model
    {
        $this->kind($kind);
        return (self::KINDS[$kind])::findOrFail($id);
    }

    private function syncClasses(string $kind, Model $node, array $in): void
    {
        if (!array_key_exists('class_level_ids', $in) || !in_array($kind, ['subjects', 'chapters'], true)) return;
        $node->classLevels()->sync(array_map('intval', $in['class_level_ids']));
    }

    private function inUse(string $kind, Model $node): bool
    {
        return match ($kind) {
            'class-levels' => $node->subjects()->exists() || $node->questions()->withTrashed()->exists()
                || Program::where('qb_class_level_id', $node->id)->exists(),        // any institution's program: this route runs under tenancy.bypass
            'subjects' => $node->chapters()->exists() || QbQuestion::withTrashed()->where('qb_subject_id', $node->id)->exists()
                || QbResource::withTrashed()->where('qb_subject_id', $node->id)->exists(),
            'chapters' => $node->topics()->exists() || QbQuestion::withTrashed()->where('qb_chapter_id', $node->id)->exists()
                || QbResource::withTrashed()->where('qb_chapter_id', $node->id)->exists(),
            'topics' => QbQuestion::withTrashed()->where('qb_topic_id', $node->id)->exists() || QbConcept::withTrashed()->where('qb_topic_id', $node->id)->exists()
                || QbResource::withTrashed()->where('qb_topic_id', $node->id)->exists(),
        };
    }

    private function row(string $kind, Model $n): array
    {
        $base = ['id' => $n->id, 'name_bn' => $n->name_bn, 'name_en' => $n->name_en, 'sort_order' => (int) $n->sort_order];
        return $base + match ($kind) {
            'class-levels' => ['education_level' => $n->education_level, 'is_active' => (bool) $n->is_active],
            'subjects' => ['code' => $n->code, 'is_active' => (bool) $n->is_active],
            'chapters' => ['qb_subject_id' => $n->qb_subject_id, 'number' => $n->number],
            'topics' => ['qb_chapter_id' => $n->qb_chapter_id],
        };
    }
}

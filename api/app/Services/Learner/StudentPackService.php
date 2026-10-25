<?php

namespace App\Services\Learner;

use App\Models\{QbChapter, QbClassLevel, QbClassLevelSubject, QbConcept, QbQuestion, QbQuestionClassLevel, QbStudentScopeAccess, QbSubject, QbTopic, User};
use App\Services\QbPricingService;

/**
 * D165 (2) ST.3: a student's whole-class, class-subject and chapter purchases.
 *  - chapter pack: every published question of the chapter and every concept of its topics;
 *  - subject pack (class C, subject S): questions of S taught in C (or linked to no class) and the concepts of S's chapters;
 *  - class pack (C): questions linked to C, or linked to no class but of a subject taught in C; concepts of C's subjects.
 * Content added later is included while the purchase is valid (the check runs on the content, not on a frozen list).
 */
class StudentPackService
{
    public const TYPES = ['class_pack' => 'class', 'subject_pack' => 'subject', 'chapter_pack' => 'chapter'];

    public function __construct(private QbPricingService $pricing) {}

    /** @return \Illuminate\Support\Collection<QbStudentScopeAccess> the caller's valid packs */
    public function active(User $user)
    {
        return QbStudentScopeAccess::active()->where('student_user_id', $user->id)->get();
    }

    /** the ids among $ids that one of the user's valid packs opens */
    public function opened(User $user, string $type, array $ids): array
    {
        $packs = $ids ? $this->active($user) : collect();
        if ($packs->isEmpty()) return [];
        return $type === 'question' ? $this->openQuestions($packs, $ids) : ($type === 'concept' ? $this->openConcepts($packs, $ids) : []);
    }

    /** the three packs a student can buy at a place in the tree, each with its price and how long a valid one of theirs still runs */
    public function offers(User $user, ?int $classId, ?int $subjectId, ?int $chapterId, array $buyer): array
    {
        $packs = $this->active($user);
        $out = [];
        $add = function (string $type, $item, array $key) use (&$out, $packs, $buyer) {
            if (!$item) return;
            $own = $packs->filter(fn ($p) => $p->scope === self::TYPES[$type] && collect($key)->every(fn ($v, $k) => (int) $p->{$k} === (int) $v))->max('expires_at');
            $q = $this->pricing->quote('student', $type, $item, $buyer);
            $out[] = ['item_type' => $type, 'item_id' => $item->id, 'qb_class_level_id' => $key['qb_class_level_id'] ?? null, 'name_bn' => $item->name_bn, 'name_en' => $item->name_en,
                'price' => $q['price'], 'owned_until' => $own ? \Illuminate\Support\Carbon::parse($own)->toIso8601String() : null];
        };
        if ($classId) $add('class_pack', QbClassLevel::find($classId), ['qb_class_level_id' => $classId]);
        if ($subjectId && $classId) $add('subject_pack', QbSubject::find($subjectId), ['qb_class_level_id' => $classId, 'qb_subject_id' => $subjectId]);
        if ($chapterId) $add('chapter_pack', QbChapter::find($chapterId), ['qb_chapter_id' => $chapterId]);
        return $out;
    }

    /** the model a pack is priced on, and the scope row's keys; the class of a subject pack is the student's own */
    public function resolve(string $type, int $id, ?int $classId): array
    {
        return match ($type) {
            'class_pack' => [QbClassLevel::findOrFail($id), ['qb_class_level_id' => $id]],
            'subject_pack' => [QbSubject::findOrFail($id), ['qb_class_level_id' => $classId ?? abort(422, 'choose your class first'), 'qb_subject_id' => $id]],
            'chapter_pack' => [QbChapter::findOrFail($id), ['qb_chapter_id' => $id]],
        };
    }

    public function owns(User $user, string $type, array $key): bool
    {
        return QbStudentScopeAccess::active()->where('student_user_id', $user->id)->where('scope', self::TYPES[$type])->where($key)->exists();
    }

    private function openQuestions($packs, array $ids): array
    {
        $rows = QbQuestion::whereIn('id', $ids)->get(['id', 'qb_subject_id', 'qb_chapter_id']);
        $classes = QbQuestionClassLevel::whereIn('qb_question_id', $ids)->get(['qb_question_id', 'qb_class_level_id'])->groupBy('qb_question_id')
            ->map(fn ($g) => $g->pluck('qb_class_level_id')->map(fn ($v) => (int) $v)->all());
        $taught = $this->subjectsTaught($packs->where('scope', 'class')->pluck('qb_class_level_id')->all());
        return $rows->filter(function ($q) use ($packs, $classes, $taught) {
            $mine = $classes[$q->id] ?? [];
            return $packs->contains(fn ($p) => match ($p->scope) {
                'chapter' => (int) $p->qb_chapter_id === (int) $q->qb_chapter_id,
                'subject' => (int) $p->qb_subject_id === (int) $q->qb_subject_id && (!$mine || in_array((int) $p->qb_class_level_id, $mine, true)),
                'class' => in_array((int) $p->qb_class_level_id, $mine, true) || (!$mine && in_array((int) $q->qb_subject_id, $taught[(int) $p->qb_class_level_id] ?? [], true)),
            });
        })->pluck('id')->map(fn ($v) => (int) $v)->values()->all();
    }

    private function openConcepts($packs, array $ids): array
    {
        $concepts = QbConcept::whereIn('id', $ids)->get(['id', 'qb_topic_id']);
        $chapterOf = QbTopic::whereIn('id', $concepts->pluck('qb_topic_id')->filter()->unique())->pluck('qb_chapter_id', 'id');
        $subjectOf = QbChapter::whereIn('id', $chapterOf->values()->unique())->pluck('qb_subject_id', 'id');
        $taught = $this->subjectsTaught($packs->whereIn('scope', ['class', 'subject'])->pluck('qb_class_level_id')->filter()->all());
        return $concepts->filter(function ($c) use ($packs, $chapterOf, $subjectOf, $taught) {
            $chapter = (int) ($chapterOf[$c->qb_topic_id] ?? 0);
            $subject = (int) ($subjectOf[$chapter] ?? 0);
            return $chapter && $packs->contains(fn ($p) => match ($p->scope) {
                'chapter' => (int) $p->qb_chapter_id === $chapter,
                'subject' => (int) $p->qb_subject_id === $subject,
                'class' => in_array($subject, $taught[(int) $p->qb_class_level_id] ?? [], true),
            });
        })->pluck('id')->map(fn ($v) => (int) $v)->values()->all();
    }

    /** class id => the subject ids taught in it (qb_class_level_subject) */
    private function subjectsTaught(array $classIds): array
    {
        if (!$classIds) return [];
        return QbClassLevelSubject::whereIn('qb_class_level_id', array_unique($classIds))->get(['qb_class_level_id', 'qb_subject_id'])->groupBy('qb_class_level_id')
            ->map(fn ($g) => $g->pluck('qb_subject_id')->map(fn ($v) => (int) $v)->all())->all();
    }
}

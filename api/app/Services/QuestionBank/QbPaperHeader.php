<?php

namespace App\Services\QuestionBank;

use App\Models\{Program, QbClassLevel, QbPaper, QbPaperItem, QbPaperSection, QbQuestion, QbSubject};
use Illuminate\Support\Facades\DB;

/**
 * Owner request 2026-10-24: the paper's heading lines filled in by themselves - its class and its subjects - for the print preview
 * and for the OMR sheet (each OMR carries its paper's heading, so sheets of different papers are not mixed up when handed out).
 */
class QbPaperHeader
{
    /** D128: the paper's subjects with names - the teacher's subject order, then any other subject in the order first met */
    public function subjects(QbPaper $paper): array
    {
        $items = $this->items($paper);
        $subjectOf = QbQuestion::whereIn('id', $items->pluck('qb_question_id'))->pluck('qb_subject_id', 'id')->map(fn ($v) => (int) $v);
        $seen = $items->sortBy(['qb_paper_section_id', 'sort_order'])->map(fn ($i) => $subjectOf[(int) $i->qb_question_id] ?? 0)->unique()->values()->all();
        $order = array_values(array_intersect(array_map('intval', $paper->instructions_json['subject_order'] ?? []), $seen));
        $names = QbSubject::whereIn('id', $subjectOf->unique())->get()->keyBy('id');
        return array_map(fn ($id) => ['id' => $id, 'name' => $names->get($id)?->name_bn ?? $names->get($id)?->name_en], array_values(array_unique(array_merge($order, $seen))));
    }

    /** the class picked while building the paper (its class filter, or its program's class), else the class most of its questions
     *  belong to, else the one class all its subjects are taught in; empty when nothing decides it */
    public function className(QbPaper $paper): string
    {
        $classId = (int) ($paper->instructions_json['class_level_id'] ?? 0) ?: null;
        if (!$classId && $paper->program_id) $classId = Program::whereKey($paper->program_id)->value('qb_class_level_id');
        if (!$classId) {
            $classId = DB::table('qb_question_class_level')->whereIn('qb_question_id', $this->items($paper)->pluck('qb_question_id'))
                ->join('qb_class_levels', 'qb_class_levels.id', '=', 'qb_question_class_level.qb_class_level_id')
                ->groupBy('qb_class_level_id', 'qb_class_levels.sort_order')->orderByRaw('count(*) desc')->orderBy('qb_class_levels.sort_order')
                ->value('qb_class_level_id');
        }
        if (!$classId) {
            $subjectIds = QbQuestion::whereIn('id', $this->items($paper)->pluck('qb_question_id'))->pluck('qb_subject_id')->unique();
            $classes = DB::table('qb_class_level_subject')->whereIn('qb_subject_id', $subjectIds)->distinct()->pluck('qb_class_level_id');
            if ($classes->count() === 1) $classId = $classes->first();
        }
        $class = $classId ? QbClassLevel::find($classId) : null;
        return (string) ($class?->name_bn ?? $class?->name_en ?? '');
    }

    /** the heading as printed: institution, exam, class, subjects, time and full marks */
    public function lines(QbPaper $paper, string $institution): array
    {
        return ['institution' => $institution, 'exam' => (string) ($paper->exam_name ?: $paper->title), 'class' => $this->className($paper),
            'subjects' => implode(', ', array_filter(array_column($this->subjects($paper), 'name'))),
            'duration_minutes' => $paper->duration_minutes, 'total_marks' => $paper->total_marks];
    }

    private function items(QbPaper $paper)
    {
        return QbPaperItem::whereIn('qb_paper_section_id', QbPaperSection::where('qb_paper_id', $paper->id)->pluck('id'))->get();
    }
}

<?php

namespace App\Imports;

use App\Models\{LessonPlan, SyllabusCoverage, SyllabusUnit};
use Illuminate\Support\Facades\Validator;

// D224 (1) kind=syllabus: one row = a chapter (and optionally one of its lessons) of a class's subject, with its term and periods.
// The chapter is found by its title under that subject or made; the lesson is made under it. A row whose chapter and lesson both
// exist is skipped (nothing is changed). Undo removes the unit the row made when nothing hangs on it (child units, coverage, plans).
final class SyllabusRowImporter extends RowImporter
{
    public function __construct(private Lookup $find) {}

    public function fields(): array { return ['program', 'subject', 'chapter', 'lesson', 'term', 'periods']; }
    public function required(): array { return ['program', 'subject', 'chapter']; }
    public function aliases(): array
    {
        return ['class' => 'program', 'course' => 'program', 'শ্রেণি' => 'program', 'বিষয়' => 'subject', 'অধ্যায়' => 'chapter', 'পাঠ' => 'lesson',
            'unit' => 'chapter', 'topic' => 'lesson', 'সাময়িক' => 'term', 'পিরিয়ড' => 'periods', 'planned_periods' => 'periods'];
    }

    public function check(array $data): array
    {
        $v = Validator::make($data, ['program' => 'required|string', 'subject' => 'required|string', 'chapter' => 'required|string|max:200',
            'lesson' => 'nullable|string|max:200', 'term' => 'nullable|string|max:20', 'periods' => 'nullable|integer|min:0|max:1000']);
        if ($v->fails()) return $this->result('error', $v->errors()->first(), $data);
        $program = $this->find->program($data['program']);
        if (!$program) return $this->result('error', __('errors.import_unknown', ['field' => 'program', 'value' => $data['program']]), $data);
        $subject = $this->find->subject($program, $data['subject']);
        if (!$subject) return $this->result('error', __('errors.import_unknown', ['field' => 'subject', 'value' => $data['subject']]), $data);
        $chapter = trim($data['chapter']);
        $lesson = trim((string) ($data['lesson'] ?? ''));
        if ($dup = $this->duplicate(implode('|', [$program->id, $subject->id, $chapter, $lesson]), $data)) return $dup;
        $ch = SyllabusUnit::where(['program_id' => $program->id, 'subject_id' => $subject->id, 'parent_id' => null, 'title' => $chapter])->first();
        if ($ch && ($lesson === '' || SyllabusUnit::where(['parent_id' => $ch->id, 'title' => $lesson])->exists())) return $this->result('skipped', __('errors.import_exists'), $data);
        return $this->result('ok', null, $data + ['_program' => $program->id, '_subject' => $subject->id]);
    }

    public function create(array $data): array
    {
        $base = ['program_id' => $data['_program'], 'subject_id' => $data['_subject']];
        $lesson = trim((string) ($data['lesson'] ?? ''));
        $next = fn ($parent) => (int) SyllabusUnit::where($base)->where('parent_id', $parent)->max('sort_order') + 1;
        $ch = SyllabusUnit::where($base + ['parent_id' => null, 'title' => trim($data['chapter'])])->first();
        if (!$ch) {
            $ch = SyllabusUnit::create($base + ['parent_id' => null, 'title' => trim($data['chapter']), 'term' => $data['term'] ?? null,
                'planned_periods' => $lesson === '' && isset($data['periods']) && $data['periods'] !== '' ? (int) $data['periods'] : null, 'sort_order' => $next(null)]);
            if ($lesson === '') return ['syllabus_units', $ch->id];
        }
        $unit = SyllabusUnit::create($base + ['parent_id' => $ch->id, 'title' => $lesson, 'term' => $data['term'] ?? null,
            'planned_periods' => isset($data['periods']) && $data['periods'] !== '' ? (int) $data['periods'] : null, 'sort_order' => $next($ch->id)]);
        return ['syllabus_units', $unit->id];
    }

    public function undo(string $table, int $id): ?string
    {
        if (SyllabusUnit::where('parent_id', $id)->exists() || SyllabusCoverage::where('unit_id', $id)->exists() || LessonPlan::where('unit_id', $id)->exists()) return __('syllabus.unit_in_use');
        SyllabusUnit::whereKey($id)->delete();
        return null;
    }
}

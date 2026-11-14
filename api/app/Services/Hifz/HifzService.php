<?php

namespace App\Services\Hifz;

use App\Models\{Batch, BatchTeacher, Enrollment, HifzRecord, Institution, Student, Teacher};
use App\Support\Tenancy;

// D214 MAD.1 (docs/modules/madrasa.md 1.3 / 1.5): page-based progress (always on; no Quran data file is loaded, so no ayah bounds),
// the stale list and the settings. Progress % = sum of sabaq pages / (pages_per_para x 30) x 100; whole paras = floor(sum / pages_per_para).
class HifzService
{
    public const DEFAULTS = ['pages_per_para' => 20, 'stale_days' => 7, 'show_parents' => false];

    public function settings(?Institution $i = null): array
    {
        $s = data_get(($i ?? Tenancy::current())->settings ?? [], 'hifz', []);
        return ['pages_per_para' => (float) ($s['pages_per_para'] ?? self::DEFAULTS['pages_per_para']), 'stale_days' => (int) ($s['stale_days'] ?? self::DEFAULTS['stale_days']),
            'show_parents' => (bool) ($s['show_parents'] ?? self::DEFAULTS['show_parents'])];
    }

    public function progress(Student $s): array
    {
        $ppp = $this->settings()['pages_per_para'];
        // pages are DECIMAL(4,1): sum in tenths as integers so 85.0 stays exact
        $tenths = HifzRecord::where('student_id', $s->id)->where('kind', 'sabaq')->pluck('pages')->sum(fn ($p) => (int) str_replace('.', '', number_format((float) $p, 1, '.', '')));
        $pages = $tenths / 10;
        $last = HifzRecord::where('student_id', $s->id)->where('kind', 'sabaq')->max('record_date');
        return ['pages' => number_format($pages, 1, '.', ''), 'paras' => (int) floor($pages / $ppp + 1e-9), 'percent' => number_format(round($pages / ($ppp * 30) * 100 + 1e-9, 2), 2, '.', ''),
            'pages_per_para' => $ppp, 'last_sabaq' => $last ? substr((string) $last, 0, 10) : null];
    }

    /** batch ids a teacher may record for: the batch's class teacher or a batch-teacher row */
    public function teacherBatchIds(Teacher $t): array
    {
        return Batch::where('teacher_id', $t->id)->pluck('id')->merge(BatchTeacher::where('teacher_id', $t->id)->pluck('batch_id'))->unique()->map(fn ($x) => (int) $x)->values()->all();
    }

    public function teacherHas(Teacher $t, int $studentId): bool
    {
        return Enrollment::where('student_id', $studentId)->where('status', 'active')->whereIn('batch_id', $this->teacherBatchIds($t) ?: [0])->exists();
    }

    /** the batch's active students with progress; `stale` = no sabaq in the last N days */
    public function overview(Batch $b, int $days): array
    {
        $since = now()->subDays($days)->toDateString();
        return Enrollment::with('student.user:id,name')->where('batch_id', $b->id)->where('status', 'active')->orderBy('roll_no')->get()->unique('student_id')
            ->filter(fn ($e) => $e->student)->map(function ($e) use ($since) {
                $p = $this->progress($e->student);
                return ['student' => ['id' => $e->student_id, 'name' => $e->student->user?->name, 'student_id' => $e->student->student_id, 'roll' => $e->roll_no]] + $p
                    + ['stale' => !$p['last_sabaq'] || $p['last_sabaq'] < $since];
            })->values()->all();
    }
}

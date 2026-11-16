<?php

namespace App\Http\Controllers\Syllabus;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Batch, BatchTeacher, Student, Subject};
use App\Services\Syllabus\SyllabusService;
use App\Support\Tenancy;
use Illuminate\Http\Request;

// D224 SYL.2: the head teacher's subject x batch x teacher matrix (a help, never a penalty - no ranking, no pay link), the
// parent / student view (off by default; completed chapters only) and its switch.
class SyllabusReportController extends Controller
{
    public function __construct(private SyllabusService $syllabus) {}

    /** GET /syllabus/overview?program_id=&term= - admin */
    public function overview(Request $request)
    {
        $f = $request->validate(['program_id' => 'required|integer', 'term' => 'nullable|string|max:20']);
        $batches = Batch::where('program_id', $f['program_id'])->orderBy('id')->get();
        $subjects = Subject::where('program_id', $f['program_id'])->orderBy('id')->get(['id', 'name']);
        $teachers = BatchTeacher::with('teacher.user:id,name')->whereIn('batch_id', $batches->pluck('id'))->get()->groupBy('batch_id');
        $rows = [];
        foreach ($subjects as $sub) foreach ($batches as $b) {
            $c = $this->syllabus->coverage($b, $sub->id, $f['term'] ?? null);
            if ($c['leaves'] === 0) continue;
            $who = ($teachers->get($b->id) ?? collect())->filter(fn ($t) => in_array((int) $t->subject_id, [0, $sub->id], true))
                ->map(fn ($t) => $t->teacher?->user?->name ?? $t->teacher?->employee_id)->filter()->unique()->values()->all();
            $rows[] = ['subject' => ['id' => $sub->id, 'name' => $sub->name], 'batch' => ['id' => $b->id, 'name' => $b->name], 'teachers' => $who,
                'percent' => $c['percent'], 'covered' => $c['covered'], 'leaves' => $c['leaves']];
        }
        return response()->json(['success' => true, 'data' => $rows]);
    }

    /** GET /syllabus/settings */
    public function settings()
    {
        return response()->json(['success' => true, 'data' => ['show_parents' => $this->syllabus->showParents()]]);
    }

    /** PUT /syllabus/settings {show_parents} - admin */
    public function updateSettings(Request $request)
    {
        $d = $request->validate(['show_parents' => 'required|boolean']);
        $i = Tenancy::current();
        $settings = $i->settings ?? [];
        $settings['syllabus'] = array_replace($settings['syllabus'] ?? [], ['show_parents' => (bool) $d['show_parents']]);
        $i->forceFill(['settings' => $settings])->save();
        AuditLog::record('syllabus.settings', $i, ['show_parents' => (bool) $d['show_parents']]);
        return $this->settings();
    }

    /** GET /parent/children/{id}/syllabus - only when the institution turned it on */
    public function child(Request $request, int $id)
    {
        $s = Student::whereKey($id)->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail();
        if (!$this->syllabus->showParents()) throw new BusinessException(__('syllabus.hidden'), 'syllabus_hidden', 403);
        return response()->json(['success' => true, 'data' => $this->syllabus->completedFor($s)]);
    }

    /** GET /student/syllabus - the signed-in student's own, only when turned on */
    public function mine(Request $request)
    {
        $s = Student::where('user_id', $request->user()->id)->firstOrFail();
        if (!$this->syllabus->showParents()) throw new BusinessException(__('syllabus.hidden'), 'syllabus_hidden', 403);
        return response()->json(['success' => true, 'data' => $this->syllabus->completedFor($s)]);
    }
}

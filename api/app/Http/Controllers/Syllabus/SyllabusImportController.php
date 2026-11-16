<?php

namespace App\Http\Controllers\Syllabus;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Program, QbChapter, QbSubject, QbTopic, Subject, SyllabusUnit};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

// D224 SYL.2: building the unit tree without typing it - clone from another program (syllabus.md section 2 (4)) and, owner choice
// D224 (2), take the chapters (and their topics as lessons) from the question bank's curriculum for the program's class. Both only
// ADD units: nothing that exists is changed or removed. (The Excel import is the data-migration kind `syllabus`.)
class SyllabusImportController extends Controller
{
    /** POST /syllabus/units/clone {from_program_id, to_program_id} - subjects matched by name; the tree and its order kept */
    public function clone(Request $request)
    {
        $inst = \App\Support\Tenancy::current()->id;
        $f = $request->validate(['from_program_id' => ['required', 'integer', Rule::exists('programs', 'id')->where('institution_id', $inst)],
            'to_program_id' => ['required', 'integer', 'different:from_program_id', Rule::exists('programs', 'id')->where('institution_id', $inst)]]);
        $target = Subject::where('program_id', $f['to_program_id'])->get()->keyBy(fn ($s) => mb_strtolower(trim($s->name)));
        $made = 0;
        $missing = [];
        DB::transaction(function () use ($f, $target, &$made, &$missing) {
            $units = SyllabusUnit::where('program_id', $f['from_program_id'])->orderBy('sort_order')->orderBy('id')->get();
            $subjects = Subject::whereIn('id', $units->pluck('subject_id')->unique())->get()->keyBy('id');
            $map = [];                                                             // old unit id -> new unit id (parent_id remapped)
            $kids = $units->groupBy(fn ($u) => (int) $u->parent_id);
            $walk = function (int $parent) use (&$walk, $kids, $subjects, $target, $f, &$map, &$made, &$missing) {
                foreach ($kids->get($parent) ?? [] as $u) {
                    $to = $target->get(mb_strtolower(trim($subjects->get($u->subject_id)?->name ?? '')));
                    if (!$to) { $missing[$subjects->get($u->subject_id)?->name ?? '?'] = true; continue; }
                    $newParent = $parent ? ($map[$parent] ?? null) : null;
                    if ($parent && !$newParent) continue;
                    $existing = SyllabusUnit::where(['program_id' => $f['to_program_id'], 'subject_id' => $to->id, 'parent_id' => $newParent, 'title' => $u->title])->first();
                    $map[$u->id] = $existing?->id ?? SyllabusUnit::create(['program_id' => $f['to_program_id'], 'subject_id' => $to->id, 'parent_id' => $newParent,
                        'title' => $u->title, 'term' => $u->term, 'planned_periods' => $u->planned_periods, 'sort_order' => $u->sort_order])->id;
                    if (!$existing) $made++;
                    $walk($u->id);
                }
            };
            $walk(0);
        });
        AuditLog::record('syllabus.cloned', Program::findOrFail($f['to_program_id']), ['from_program_id' => $f['from_program_id'], 'made' => $made]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['made' => $made, 'subjects_not_found' => array_keys($missing)]]);
    }

    /** GET /syllabus/qb-subjects?program_id= - the question-bank subjects of the program's class (empty = the button is not offered) */
    public function qbSubjects(Request $request)
    {
        $f = $request->validate(['program_id' => 'required|integer']);
        $level = Program::findOrFail($f['program_id'])->qb_class_level_id;
        $rows = $level ? QbSubject::whereHas('classLevels', fn ($q) => $q->whereKey($level))->orderBy('id')->get(['id', 'name_bn', 'name_en']) : collect();
        return response()->json(['success' => true, 'data' => $rows->values()]);
    }

    /** POST /syllabus/units/from-question-bank {program_id, subject_id, qb_subject_id} - chapters -> units, topics -> lessons; adds only */
    public function fromQuestionBank(Request $request)
    {
        $inst = \App\Support\Tenancy::current()->id;
        $f = $request->validate(['program_id' => ['required', 'integer', Rule::exists('programs', 'id')->where('institution_id', $inst)],
            'subject_id' => ['required', 'integer', Rule::exists('subjects', 'id')->where('institution_id', $inst)->where('program_id', (int) $request->input('program_id'))],
            'qb_subject_id' => 'required|integer']);
        $level = Program::findOrFail($f['program_id'])->qb_class_level_id;
        $linked = $level && QbSubject::whereKey($f['qb_subject_id'])->whereHas('classLevels', fn ($q) => $q->whereKey($level))->exists();
        if (!$linked) throw \Illuminate\Validation\ValidationException::withMessages(['qb_subject_id' => __('syllabus.qb_not_offered')]);
        $chapters = QbChapter::where('qb_subject_id', $f['qb_subject_id'])
            ->where(fn ($q) => $q->whereHas('classLevels', fn ($c) => $c->whereKey($level))->orWhereDoesntHave('classLevels'))   // a chapter tied to no class serves every class
            ->orderBy('sort_order')->orderBy('number')->orderBy('id')->get();
        $topics = QbTopic::whereIn('qb_chapter_id', $chapters->pluck('id'))->orderBy('sort_order')->orderBy('id')->get()->groupBy('qb_chapter_id');
        $made = 0;
        DB::transaction(function () use ($f, $chapters, $topics, &$made) {
            $base = ['program_id' => $f['program_id'], 'subject_id' => $f['subject_id']];
            $order = (int) SyllabusUnit::where($base)->whereNull('parent_id')->max('sort_order');
            foreach ($chapters as $c) {
                $ch = SyllabusUnit::where($base + ['parent_id' => null, 'title' => $c->name_bn])->first();
                if (!$ch) { $ch = SyllabusUnit::create($base + ['parent_id' => null, 'title' => $c->name_bn, 'sort_order' => ++$order]); $made++; }
                $k = (int) SyllabusUnit::where('parent_id', $ch->id)->max('sort_order');
                foreach ($topics->get($c->id) ?? [] as $t) {
                    if (SyllabusUnit::where(['parent_id' => $ch->id, 'title' => $t->name_bn])->exists()) continue;
                    SyllabusUnit::create($base + ['parent_id' => $ch->id, 'title' => $t->name_bn, 'sort_order' => ++$k]);
                    $made++;
                }
            }
        });
        AuditLog::record('syllabus.from_question_bank', Program::findOrFail($f['program_id']), ['subject_id' => $f['subject_id'], 'made' => $made]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['made' => $made]]);
    }
}

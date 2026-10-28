<?php

namespace App\Http\Controllers\QuestionBank;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Http\Resources\QbQuestionPublicResource;
use App\Models\{AuditLog, QbOmrForm, QbOmrScan, QbPaper, QbPaperItem, QbPaperRevision, QbPaperSection, QbPaperVariant, QbQuestion, QbUnlock, User};
use App\Services\{PdfService, QbPaperSets, QbPricingService};
use App\Services\QuestionBank\{QbOmrFormService, QbPaperHeader};
use App\Support\{Money, Tenancy};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// QB.8 (D66, docs/modules/question-bank.md §3চ, §5): question papers of an institution. A teacher sees and edits only their own
// papers, the head teacher (admin) every paper of the institution. A paper uses only questions the institution has bought
// (one purchase = answer + paper use, D66 (3)): saving with a not-yet-bought question answers 422 qb_paper_unbought with those
// ids and their total, so the page can confirm and buy them (POST /question-bank/buy-many) and save again. Drafts are edited and
// deleted; a final paper is printed: Chromium (D50), set A as built and set B shuffled (questions within each section and MCQ
// options, the same every time), with or without the answers.
class QbPaperController extends Controller
{
    private const LABELS = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ'];

    /** GET /question-bank/papers?status= */
    public function index(Request $request)
    {
        $this->staffGate($request);
        $f = $request->validate(['status' => 'nullable|in:draft,final']);
        $rows = $this->visible($request->user())->when($f['status'] ?? null, fn ($q, $s) => $q->where('status', $s))->orderByDesc('updated_at')->limit(200)->get();
        $authors = User::whereIn('id', $rows->pluck('created_by')->unique())->pluck('name', 'id');
        return response()->json(['success' => true, 'data' => $rows->map(fn ($p) => $p->only(['id', 'title', 'exam_name', 'total_marks', 'status', 'sets_count', 'created_by', 'qb_paper_folder_id'])
            + ['author' => $authors[$p->created_by] ?? null, 'updated_at' => $p->updated_at?->toIso8601String()])->values()]);
    }

    /** POST /question-bank/papers */
    public function store(Request $request)
    {
        $this->staffGate($request);
        $in = $this->validated($request);
        if ($missing = $this->unbought($in)) return $missing;
        $paper = DB::transaction(function () use ($in, $request) {
            $paper = QbPaper::create(collect($in)->except('sections')->all() + ['created_by' => $request->user()->id, 'status' => 'draft']);
            $this->sections($paper, $in['sections']);
            return $paper;
        });
        return response()->json(['success' => true, 'data' => $this->row($paper->fresh()), 'message' => __('messages.saved')], 201);
    }

    /** GET /question-bank/papers/{id} */
    public function show(Request $request, int $id)
    {
        $this->staffGate($request);
        return response()->json(['success' => true, 'data' => $this->row($this->find($request->user(), $id))]);
    }

    /** PUT /question-bank/papers/{id}: the whole paper again (sections and items replaced); drafts only - on a final paper only the
     *  settings change, as a new revision (D180) */
    public function update(Request $request, int $id, QbPaperSets $sets)
    {
        $this->staffGate($request);
        $paper = $this->find($request->user(), $id);
        if ($paper->status !== 'draft') return $this->revise($request, $paper, $sets);
        $in = $this->validated($request);
        if ($missing = $this->unbought($in)) return $missing;
        DB::transaction(function () use ($paper, $in) {
            $paper->update(collect($in)->except('sections')->all());
            QbPaperItem::whereIn('qb_paper_section_id', QbPaperSection::where('qb_paper_id', $paper->id)->pluck('id'))->delete();
            QbPaperSection::where('qb_paper_id', $paper->id)->delete();
            $this->sections($paper, $in['sections']);
        });
        return response()->json(['success' => true, 'data' => $this->row($paper->fresh()), 'message' => __('messages.saved')]);
    }

    /** D180 (1)(2)(6): a final paper's settings block (title, exam name, duration, set count, instructions with subject grouping and
     *  order) stays editable. A changed save makes the next immutable revision with its own frozen sets (same strategy and naming as
     *  the revision before; D126/D128/D173) - earlier revisions, their sets, OMR forms and scans never change; the same values make no
     *  revision. Questions, sections and marks stay locked. */
    private function revise(Request $request, QbPaper $paper, QbPaperSets $sets)
    {
        $in = $request->validate([
            'title' => 'required|string|max:200', 'exam_name' => 'nullable|string|max:200', 'duration_minutes' => 'nullable|integer|min:1|max:600',
            'sets_count' => 'nullable|integer|min:1|max:' . QbPaperSets::MAX, 'instructions_json' => 'nullable|array',
            'instructions_json.text' => 'nullable|string|max:2000', 'instructions_json.group_by_subject' => 'nullable|boolean',
            'instructions_json.subject_order' => 'nullable|array|max:50', 'instructions_json.subject_order.*' => 'integer',
            'instructions_json.class_level_id' => 'nullable|integer|exists:qb_class_levels,id',
            'sections' => 'sometimes', 'program_id' => 'sometimes', 'qb_subject_id' => 'sometimes',
            'status' => 'prohibited', 'total_marks' => 'prohibited',
        ]);
        // questions, sections and marks are locked on a final paper: a save that sends them at all is refused (only the settings block)
        if (array_key_exists('sections', $in)) throw new BusinessException('a final paper cannot be changed', 'qb_paper_final', 422);
        $current = $paper->currentRevision();
        $next = ['title' => $in['title'], 'exam_name' => $in['exam_name'] ?? null, 'duration_minutes' => isset($in['duration_minutes']) ? (int) $in['duration_minutes'] : null,
            'sets_count' => (int) ($in['sets_count'] ?? $paper->sets_count), 'instructions_json' => $in['instructions_json'] ?? null];
        $before = $current?->settings_json ?? $paper->settingsSnapshot();
        $changed = array_values(array_filter(QbPaperRevision::SETTINGS, fn ($k) => json_encode($before[$k] ?? null) !== json_encode($next[$k] ?? null)));
        if ($changed === []) return response()->json(['success' => true, 'data' => $this->row($paper), 'message' => __('messages.saved')]);
        $first = $current ? QbPaperVariant::current($paper, $current->id)->orderBy('variant_number')->first() : null;
        DB::transaction(function () use ($request, $paper, $sets, $next, $current, $first) {
            $paper->update($next);
            QbPaperRevision::create(['qb_paper_id' => $paper->id, 'revision_number' => ($current?->revision_number ?? 0) + 1, 'settings_json' => $next, 'created_by' => $request->user()->id]);
            $sets->freeze($paper, $this->sectionList($paper), $next['sets_count'], $first?->strategy ?? 'both',
                $first && preg_match('/^[\x{0995}-\x{099E}]/u', (string) $first->code) ? 'bangla' : 'latin');
        });
        AuditLog::record('qb.paper.revised', $paper, ['changed' => $changed, 'revision' => ($current?->revision_number ?? 0) + 1]);
        return response()->json(['success' => true, 'data' => $this->row($paper->fresh()), 'message' => __('messages.saved')]);
    }

    /** GET /question-bank/papers/{id}/revisions: D180 (6) - the paper's revisions, newest first, with what each changed */
    public function revisions(Request $request, int $id)
    {
        $this->staffGate($request);
        $paper = $this->find($request->user(), $id);
        $list = $paper->revisions()->get();
        $authors = User::whereIn('id', $list->pluck('created_by')->unique())->pluck('name', 'id');
        return response()->json(['success' => true, 'data' => $list->map(fn ($r, $k) => ['number' => $r->revision_number, 'settings' => $r->settings_json,
            'changed' => $k === 0 ? [] : array_values(array_filter(QbPaperRevision::SETTINGS, fn ($key) => json_encode($list[$k - 1]->settings_json[$key] ?? null) !== json_encode($r->settings_json[$key] ?? null))),
            'sets' => QbPaperVariant::current($paper, $r->id)->count(), 'author' => $authors[$r->created_by] ?? null, 'created_at' => $r->created_at?->toIso8601String()])->reverse()->values()]);
    }

    /** DELETE /question-bank/papers/{id}: drafts only */
    public function destroy(Request $request, int $id)
    {
        $this->staffGate($request);
        $paper = $this->find($request->user(), $id);
        if ($paper->status !== 'draft') throw new BusinessException('a final paper cannot be deleted', 'qb_paper_final', 422);
        DB::transaction(function () use ($paper) {
            QbPaperItem::whereIn('qb_paper_section_id', QbPaperSection::where('qb_paper_id', $paper->id)->pluck('id'))->delete();
            QbPaperSection::where('qb_paper_id', $paper->id)->delete();
            $paper->delete();
        });
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** POST /question-bank/papers/{id}/finalize {strategy?, set_names?}: a paper with at least one question becomes final (printed,
     *  no longer edited); D126 (2): its sets are frozen then - strategy options|serial|both (default both), names latin|bangla */
    public function finalize(Request $request, int $id, QbPaperSets $sets)
    {
        $this->staffGate($request);
        $paper = $this->find($request->user(), $id);
        $in = $request->validate(['strategy' => 'nullable|in:' . implode(',', QbPaperSets::STRATEGIES), 'set_names' => 'nullable|in:latin,bangla',
            'count' => 'nullable|integer|min:1|max:' . (QbPaperSets::MAX - 1), 'remove' => 'nullable|array|min:1|max:' . QbPaperSets::MAX, 'remove.*' => 'integer|min:1']);
        if ($paper->status !== 'draft' && isset($in['remove'])) return $this->removeSets($request, $paper, $sets, $in['remove']);
        if ($paper->status !== 'draft' && isset($in['count'])) return $this->addSets($request, $paper, $sets, (int) $in['count'], $in['strategy'] ?? 'both');
        if ($paper->status !== 'draft') throw new BusinessException('already final', 'qb_paper_final', 422);
        if ($this->items($paper)->isEmpty()) throw new BusinessException('a paper needs at least one question', 'qb_paper_empty', 422);
        DB::transaction(function () use ($request, $paper, $sets, $in) {
            // D180 (5): becoming final makes revision 1 - the settings snapshot that owns these sets
            if (!$paper->currentRevision()) QbPaperRevision::create(['qb_paper_id' => $paper->id, 'revision_number' => 1, 'settings_json' => $paper->settingsSnapshot(), 'created_by' => $request->user()->id]);
            $sets->freeze($paper, $this->sectionList($paper), (int) $paper->sets_count, $in['strategy'] ?? 'both', $in['set_names'] ?? 'latin');
            $paper->update(['status' => 'final']);
        });
        AuditLog::record('qb.paper.finalized', $paper, ['total_marks' => $paper->total_marks]);
        return response()->json(['success' => true, 'data' => $this->row($paper->fresh()), 'message' => __('messages.saved')]);
    }

    /** qbank's "create subsets" (D126 (2), D133 - "create sets" is the same action as making the paper final): on a final paper,
     *  POST .../finalize with `count` adds that many frozen sets after the existing ones; refused once an OMR sheet of the paper is
     *  scanned (D133), and a generated OMR layout is unlocked so it is rebuilt with the new sets */
    private function addSets(Request $request, QbPaper $paper, QbPaperSets $sets, int $count, string $strategy)
    {
        $form = QbOmrForm::current($paper)->first();
        if ($form && QbOmrScan::where('qb_omr_form_id', $form->id)->exists()) throw new BusinessException('an OMR sheet of this paper is already scanned', 'qb_paper_scanned', 422);
        DB::transaction(function () use ($request, $paper, $sets, $count, $strategy, $form) {
            $sets->append($paper, $this->sectionList($paper), $count, $strategy);
            $paper->update(['sets_count' => QbPaperVariant::current($paper)->count()]);
            if ($form?->locked_at !== null) app(QbOmrFormService::class)->unlock($request->user(), $paper->id);
        });
        AuditLog::record('qb.paper.sets_added', $paper, ['count' => $count, 'strategy' => $strategy]);
        return response()->json(['success' => true, 'data' => $this->row($paper->fresh()), 'message' => __('messages.saved')]);
    }

    /** D157: delete one or more sets of a final paper (POST .../finalize with `remove` = set numbers): never the main set, never after an
     *  OMR sheet is scanned; the rest are renamed in order; a generated OMR layout is unlocked to be rebuilt */
    private function removeSets(Request $request, QbPaper $paper, QbPaperSets $sets, array $numbers)
    {
        $form = QbOmrForm::current($paper)->first();
        if ($form && QbOmrScan::where('qb_omr_form_id', $form->id)->exists()) throw new BusinessException('an OMR sheet of this paper is already scanned', 'qb_paper_scanned', 422);
        DB::transaction(function () use ($request, $paper, $sets, $numbers, $form) {
            $paper->update(['sets_count' => $sets->remove($paper, $numbers)]);
            if ($form?->locked_at !== null) app(QbOmrFormService::class)->unlock($request->user(), $paper->id);
        });
        AuditLog::record('qb.paper.sets_deleted', $paper, ['sets' => array_values(array_map('intval', $numbers))]);
        return response()->json(['success' => true, 'data' => $this->row($paper->fresh()), 'message' => __('messages.saved')]);
    }

    /** GET /question-bank/papers/{id}/pdf?set=A|B&answers=0|1[&format=json] */
    public function pdf(Request $request, int $id, PdfService $pdf)
    {
        $institution = $request->user()?->institution()->first();
        if ($institution && (!Tenancy::current() || Tenancy::current()->id !== $institution->id)) {
            return Tenancy::as($institution, fn () => $this->pdf($request, $id, $pdf));
        }
        $this->staffGate($request);
        $f = $request->validate(['set' => ['nullable', 'regex:/^(?:[A-Z]|[1-9]\d{0,2})$/'], 'answers' => 'nullable|boolean', 'format' => 'nullable|in:json',
            'strategy' => 'nullable|in:' . implode(',', QbPaperSets::STRATEGIES), 'columns' => 'nullable|in:1,2,4,auto',
            'paper' => 'nullable|in:a4,a5,letter,legal', 'orientation' => 'nullable|in:portrait,landscape', 'revision' => 'nullable|integer|min:1']);
        $paper = $this->find($request->user(), $id);
        // D180 (6): an older revision prints with its own settings and sets; none named = the latest
        $revision = isset($f['revision']) ? QbPaperRevision::where('qb_paper_id', $paper->id)->where('revision_number', (int) $f['revision'])->first() : $paper->currentRevision();
        if (isset($f['revision']) && !$revision) throw new BusinessException('this paper has no such revision', 'qb_no_such_revision', 422);
        if ($revision && isset($f['revision'])) $paper = (clone $paper)->forceFill($revision->settings_json);
        $set = (string) ($f['set'] ?? '1');                       // D173: a set number; the old A-Z letters still work (A = 1 ... Z = 26)
        $number = ctype_digit($set) ? (int) $set : array_search($set, QbPaperSets::LATIN, true) + 1;
        if ($number > max(1, (int) $paper->sets_count)) throw new BusinessException('this paper has no such set', 'qb_no_such_set', 422);
        $columns = $f['columns'] ?? 'auto';
        $layout = ['columns' => $columns, 'paper' => $f['paper'] ?? 'a4', 'orientation' => $f['orientation'] ?? 'portrait'];
        $data = $this->printable($paper, $number, (bool) ($f['answers'] ?? false), $f['strategy'] ?? 'both', $revision?->id) + $layout + ['revision' => $revision?->revision_number];
        if (($f['format'] ?? null) === 'json') return response()->json(['success' => true, 'data' => $data]);
        $bytes = $pdf->render('pdf.qb-paper', ['paper' => $data], $layout['paper'], $layout['orientation'], true);   // D118 (4): graphs and diagrams drawn
        return response($bytes, 200, ['Content-Type' => 'application/pdf',
            'Content-Length' => (string) strlen($bytes),
            'Content-Disposition' => 'inline; filename="paper-' . $paper->id . '-' . $data['set'] . '.pdf"']);
    }

    private function validated(Request $request): array
    {
        $in = $request->validate([
            'title' => 'required|string|max:200', 'exam_name' => 'nullable|string|max:200', 'program_id' => 'nullable|integer|exists:programs,id',
            'qb_subject_id' => 'nullable|integer', 'duration_minutes' => 'nullable|integer|min:1|max:600', 'instructions_json' => 'nullable|array',
            'instructions_json.text' => 'nullable|string|max:2000',
            'instructions_json.group_by_subject' => 'nullable|boolean', 'instructions_json.subject_order' => 'nullable|array|max:50',   // D128
            'instructions_json.subject_order.*' => 'integer',
            'instructions_json.class_level_id' => 'nullable|integer|exists:qb_class_levels,id',   // owner 2026-10-24: the class picked while building, for the heading
            'sets_count' => 'nullable|integer|min:1|max:' . QbPaperSets::MAX,   // D126 (2)
            'sections' => 'required|array|min:1|max:20', 'sections.*.title' => 'required|string|max:200', 'sections.*.instruction' => 'nullable|string|max:500',
            'sections.*.items' => 'present|array|max:100', 'sections.*.items.*.qb_question_id' => 'required|integer',
            'sections.*.items.*.marks' => ['required', 'regex:/^\d{1,3}(\.\d{1,2})?$/'],
            'status' => 'prohibited', 'total_marks' => 'prohibited',
        ]);
        $ids = collect($in['sections'])->flatMap(fn ($s) => collect($s['items'])->pluck('qb_question_id'));
        if ($ids->duplicates()->isNotEmpty()) throw \Illuminate\Validation\ValidationException::withMessages(['sections' => __('errors.qb_paper_duplicate')]);
        if (QbQuestion::whereIn('id', $ids)->count() !== $ids->unique()->count()) throw \Illuminate\Validation\ValidationException::withMessages(['sections' => __('errors.qb_no_such_item')]);
        // D171 (4): a stimulus MCQ group's paper marks are the sum of its children's own marks - set here, never the author's number;
        // a group with a child without marks cannot be used
        $groups = app(QbPaperSets::class)->groups([['items' => $ids->map(fn ($id) => ['qb_question_id' => (int) $id])->all()]]);
        foreach ($in['sections'] as &$sec) foreach ($sec['items'] as &$it) {
            $children = $groups[(int) $it['qb_question_id']] ?? null;
            if ($children === null) continue;
            if ($children === [] || collect($children)->contains(fn ($c) => Money::toPaisa((string) ($c['marks'] ?? '0')) <= 0)) {
                throw \Illuminate\Validation\ValidationException::withMessages(['sections' => __('errors.qb_group_marks_missing')]);
            }
            $it['marks'] = Money::format(collect($children)->sum(fn ($c) => Money::toPaisa((string) $c['marks'])));
        }
        unset($sec, $it);
        $total = collect($in['sections'])->flatMap(fn ($s) => $s['items'])->sum(fn ($i) => Money::toPaisa((string) $i['marks']));   // marks: two decimals, same arithmetic
        return $in + ['total_marks' => Money::format($total), 'sets_count' => $in['sets_count'] ?? 1];
    }

    /** 422 with the questions this institution has not bought yet, and what they cost now; null when every one is bought */
    private function unbought(array $in)
    {
        $ids = collect($in['sections'])->flatMap(fn ($s) => collect($s['items'])->pluck('qb_question_id'))->map(fn ($v) => (int) $v)->unique();
        $have = QbUnlock::where('item_type', 'question')->whereIn('item_id', $ids)->pluck('item_id')->map(fn ($v) => (int) $v);
        $missing = $ids->diff($have)->values();
        if ($missing->isEmpty()) return null;
        $pricing = app(QbPricingService::class);
        $total = QbQuestion::whereIn('id', $missing)->get()->sum(fn ($q) => Money::toPaisa($pricing->quote('institution', 'question', $q)['price'] ?? '0'));
        return response()->json(['success' => false, 'error' => 'qb_paper_unbought', 'message' => __('errors.qb_paper_unbought'),
            'data' => ['ids' => $missing->all(), 'total' => Money::format($total)]], 422);
    }

    private function sections(QbPaper $paper, array $sections): void
    {
        foreach (array_values($sections) as $i => $s) {
            $section = QbPaperSection::create(['qb_paper_id' => $paper->id, 'title' => $s['title'], 'instruction' => $s['instruction'] ?? null, 'sort_order' => $i]);
            foreach (array_values($s['items']) as $j => $it) QbPaperItem::create(['qb_paper_section_id' => $section->id, 'qb_question_id' => $it['qb_question_id'], 'marks' => $it['marks'], 'sort_order' => $j]);
        }
    }

    private function visible(User $user)
    {
        return $user->role === 'admin' ? QbPaper::query() : QbPaper::where('created_by', $user->id);   // another teacher's paper: 404
    }

    private function find(User $user, int $id): QbPaper
    {
        return $this->visible($user)->findOrFail($id);
    }

    private function items(QbPaper $paper)
    {
        return QbPaperItem::whereIn('qb_paper_section_id', QbPaperSection::where('qb_paper_id', $paper->id)->pluck('id'))->get();
    }

    private function row(QbPaper $p): array
    {
        $items = $this->items($p)->groupBy('qb_paper_section_id');
        return $p->only(['id', 'title', 'exam_name', 'program_id', 'qb_subject_id', 'duration_minutes', 'total_marks', 'instructions_json', 'status', 'sets_count', 'created_by'])
            + ['updated_at' => $p->updated_at?->toIso8601String(),
               'subjects' => $this->subjects($p),   // D128: the paper's subjects, in the order the paper groups them
               // D126 (2): the frozen sets (set = the Latin letter the print takes, code = the printed name)
               'revision' => $p->currentRevision()?->revision_number,   // D180: the latest revision (null while a draft)
               'sets' => QbPaperVariant::current($p)->orderBy('variant_number')->get()->map(fn ($v) => ['number' => $v->variant_number, 'set' => self::address($v->variant_number), 'code' => $v->code, 'strategy' => $v->strategy])->values(),
               'sections' => QbPaperSection::where('qb_paper_id', $p->id)->orderBy('sort_order')->get()->map(fn ($s) => ['id' => $s->id, 'title' => $s->title, 'instruction' => $s->instruction,
                   'items' => ($items[$s->id] ?? collect())->sortBy('sort_order')->map(fn ($i) => ['qb_question_id' => (int) $i->qb_question_id, 'marks' => $i->marks])->values()])->values()];
    }

    /** The paper as printed (D126 (2)): a final paper prints its frozen set; a draft previews the set computed the same way */
    private function printable(QbPaper $paper, int $number, bool $answers, string $strategy, ?int $revisionId = null): array
    {
        $row = $this->row($paper);
        $frozen = $paper->status === 'final' ? QbPaperVariant::current($paper, $revisionId)->where('variant_number', $number)->first() : null;
        $sets = app(QbPaperSets::class);
        $list = $this->sectionList($paper);
        $layout = $frozen?->layout_json ?? $sets->layout($paper, $list, $number, $strategy, $sets->optionCounts($list));
        $questions = QbQuestion::whereIn('id', collect($row['sections'])->flatMap(fn ($s) => collect($s['items'])->pluck('qb_question_id')))->get()->keyBy('id');
        $open = QbUnlock::where('item_type', 'question')->whereIn('item_id', $questions->keys())->pluck('item_id')->map(fn ($v) => (int) $v)->all();
        $marks = collect($row['sections'])->flatMap(fn ($s) => collect($s['items'])->mapWithKeys(fn ($it) => [$it['qb_question_id'] => $it['marks']]));
        $bySection = collect($row['sections'])->keyBy('id');
        $n = ['mcq' => 0, 'other' => 0];                          // D129: MCQs and written questions have separate serials
        $groups = $sets->groups($list);                           // D171: a stimulus MCQ group's children are numbered MCQs
        $mcq = QbQuestion::whereIn('id', $questions->keys())->whereHas('type', fn ($t) => $t->where('slug', 'mcq'))->pluck('id')->map(fn ($v) => (int) $v)->flip();
        $key = [];
        $subjectNames = collect($row['subjects'])->pluck('name', 'id');
        $sections = collect($layout)->map(function ($ls) use ($questions, $open, $answers, $marks, $bySection, $subjectNames, $mcq, $groups, &$n, &$key) {
            $s = $bySection[$ls['section_id']] ?? ['title' => '', 'instruction' => null];
            $prev = null;
            return ['title' => $s['title'], 'instruction' => $s['instruction'], 'items' => collect($ls['items'])->filter(fn ($it) => isset($questions[$it['qb_question_id']]))->map(function ($it) use ($questions, $open, $answers, $marks, $subjectNames, $mcq, $groups, &$n, &$key, &$prev) {
                $heading = null;                                 // D128: a subject block's heading over its first question
                if (isset($it['qb_subject_id']) && $it['qb_subject_id'] !== $prev) { $prev = $it['qb_subject_id']; $heading = $subjectNames[$it['qb_subject_id']] ?? ''; }
                $q = QbQuestionPublicResource::make($questions[$it['qb_question_id']], $answers && in_array($it['qb_question_id'], $open, true));
                $opts = $it['options'] === [] ? $q['options'] : array_values(array_filter(array_map(fn ($k) => $q['options'][$k] ?? null, $it['options'])));
                foreach ($opts as $k => &$o) $o['label'] = self::LABELS[$k] ?? (string) ($k + 1);   // relabelled by position
                unset($o);
                $shown = $answers && in_array($it['qb_question_id'], $open, true);
                if (isset($groups[(int) $it['qb_question_id']])) return self::group($it, $q, $groups[(int) $it['qb_question_id']], $shown, $heading, $marks[$it['qb_question_id']] ?? $it['marks'], $n, $key);
                $no = ++$n[isset($mcq[(int) $it['qb_question_id']]) ? 'mcq' : 'other'];
                if (!empty($it['correct']) && $answers && in_array($it['qb_question_id'], $open, true)) $key[] = ['no' => $no, 'correct' => $it['correct']];   // bought only, like the answers
                return ['no' => $no, 'marks' => $marks[$it['qb_question_id']] ?? $it['marks'], 'subject' => $heading, 'question' => ['options' => $opts] + $q];
            })->values()->all()];
        })->all();
        return $paper->only(['id', 'title', 'exam_name', 'duration_minutes', 'total_marks']) + ['instructions' => $paper->instructions_json['text'] ?? null,
            'set' => self::address($number), 'set_code' => $frozen?->code ?? QbPaperSets::code($number, max(1, (int) $paper->sets_count)), 'sets_count' => (int) $paper->sets_count,
            'answers' => $answers, 'institution' => Tenancy::current()->name, 'sections' => $sections,
            // owner request 2026-10-24: the heading's class and subjects load by themselves
            'class_name' => app(QbPaperHeader::class)->className($paper), 'subject_names' => implode(', ', array_filter(array_column($row['subjects'], 'name'))), 'subject_codes' => QbPaperHeader::codes($row['subjects']),
            'answer_key' => $answers ? $key : [],   // D126 (4): the set's own key (frozen sets only), with the answers copy
            // R2.1.2: only the pictures the printed questions may show (the public shape already left out answer-only ones)
            'media' => self::pictures($questions->keys()->all(), collect($sections)->flatMap(fn ($s) => collect($s['items'])->flatMap(fn ($it) => array_column($it['question']['media'], 'id')))->all())];
    }

    /** D171: a stimulus MCQ group prints its stimulus once, then each sub_mcq child in authored order as the next numbered MCQ (its
     *  own marks, its choices in the set's order, the correct choice moved with them); the group itself takes no serial. A set
     *  frozen before D171 (no child order) prints the children in their authored option order. */
    private static function group(array $it, array $q, array $children, bool $shown, ?string $heading, $marks, array &$n, array &$key): array
    {
        $k = 0;
        $q['items'] = array_map(function ($p) use ($it, $children, $shown, &$k, &$n, &$key) {
            if ($p['item_type'] !== 'sub_mcq') return $p;
            $c = $children[$k] ?? ['options' => count((array) ($p['prompt_json']['options'] ?? [])), 'correct' => null];
            $order = $it['children'][$k] ?? range(0, max(0, $c['options'] - 1));
            $options = array_values((array) ($p['prompt_json']['options'] ?? []));
            $p['prompt_json']['options'] = array_values(array_filter(array_map(fn ($o) => $options[$o] ?? null, $order), fn ($v) => $v !== null));
            if (isset($p['answer_json']['correct']) && is_int($p['answer_json']['correct'])) {
                $pos = array_search($p['answer_json']['correct'], $order, true);
                $p['answer_json']['correct'] = $pos === false ? -1 : $pos;
            }
            $p['no'] = ++$n['mcq'];
            $correct = $it['children_correct'][$k] ?? [];
            if ($correct !== [] && $shown) $key[] = ['no' => $p['no'], 'correct' => $correct];   // bought only, like the answers
            $k++;
            return $p;
        }, $q['items'] ?? []);
        return ['no' => null, 'marks' => $marks, 'subject' => $heading, 'question' => $q];
    }

    /** the paper's sections with their items in the order built (the input of every set) */
    private function sectionList(QbPaper $paper): array
    {
        $items = $this->items($paper)->groupBy('qb_paper_section_id');
        $list = QbPaperSection::where('qb_paper_id', $paper->id)->orderBy('sort_order')->orderBy('id')->get()->map(fn ($s) => ['id' => $s->id,
            'items' => ($items[$s->id] ?? collect())->sortBy('sort_order')->map(fn ($i) => ['qb_question_id' => (int) $i->qb_question_id, 'marks' => $i->marks])->values()->all()])->all();
        if (empty($paper->instructions_json['group_by_subject'])) return $list;
        // D128: inside each section, subject blocks in the teacher's order (a subject not in the order follows, as first met); the
        // order inside a block is the order built, and sets shuffle only inside a block (QbPaperSets)
        $subjectOf = QbQuestion::whereIn('id', $this->items($paper)->pluck('qb_question_id'))->pluck('qb_subject_id', 'id')->map(fn ($v) => (int) $v);
        $rank = array_flip($this->subjectOrder($paper, $subjectOf));
        foreach ($list as &$sec) {
            $sec['grouped'] = true;
            foreach ($sec['items'] as $k => &$it) { $it['qb_subject_id'] = $subjectOf[$it['qb_question_id']] ?? 0; $it['_k'] = $k; }
            unset($it);
            usort($sec['items'], fn ($a, $b) => [$rank[$a['qb_subject_id']] ?? PHP_INT_MAX, $a['_k']] <=> [$rank[$b['qb_subject_id']] ?? PHP_INT_MAX, $b['_k']]);
            $sec['items'] = array_map(fn ($it) => array_diff_key($it, ['_k' => 1]), $sec['items']);
        }
        unset($sec);
        return $list;
    }

    /** D128: the teacher's subject order, then any other subject of the paper in the order first met */
    private function subjectOrder(QbPaper $paper, $subjectOf): array
    {
        $seen = $this->items($paper)->sortBy(['qb_paper_section_id', 'sort_order'])->map(fn ($i) => $subjectOf[(int) $i->qb_question_id] ?? 0)->unique()->values()->all();
        $order = array_values(array_intersect(array_map('intval', $paper->instructions_json['subject_order'] ?? []), $seen));
        return array_values(array_unique(array_merge($order, $seen)));
    }

    /** D128: the paper's subjects with names, in grouping order */
    private function subjects(QbPaper $paper): array
    {
        return app(QbPaperHeader::class)->subjects($paper);
    }

    /** QB.14: the questions' own pictures as data: URIs for the PDF (only media linked to these questions; a large file is left out) */
    private static function pictures(array $questionIds, array $allowed): array
    {
        $ids = \App\Models\QbMediaLink::where('owner_type', 'question')->whereIn('owner_id', $questionIds)->pluck('qb_media_id')->unique()->intersect($allowed);
        $out = [];
        foreach (\App\Models\QbMedia::whereIn('id', $ids)->get() as $m) {
            if (!str_starts_with((string) $m->mime, 'image/') || $m->size_bytes > 2_000_000 || !\Illuminate\Support\Facades\Storage::disk('private')->exists($m->path)) continue;
            $out[$m->id] = 'data:' . $m->mime . ';base64,' . base64_encode(\Illuminate\Support\Facades\Storage::disk('private')->get($m->path));
        }
        return $out;
    }

    /** D173: how a set is addressed in links - its old A-Z letter up to 26 (unchanged links), its number above */
    private static function address(int $number): string
    {
        return QbPaperSets::LATIN[$number - 1] ?? (string) $number;
    }

    /** D101: department staff need their X-Department-Id context and this route's exact duty key on every request */
    private function staffGate(Request $request): void
    {
        if ($request->user()?->role === 'institution_staff') app(\App\Services\DepartmentRequestContextService::class)->forRoute($request);
    }
}

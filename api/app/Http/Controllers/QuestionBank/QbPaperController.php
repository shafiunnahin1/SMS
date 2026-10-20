<?php

namespace App\Http\Controllers\QuestionBank;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Http\Resources\QbQuestionPublicResource;
use App\Models\{AuditLog, QbPaper, QbPaperItem, QbPaperSection, QbPaperVariant, QbQuestion, QbUnlock, User};
use App\Services\{PdfService, QbPaperSets, QbPricingService};
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

    /** PUT /question-bank/papers/{id}: the whole paper again (sections and items replaced); drafts only */
    public function update(Request $request, int $id)
    {
        $this->staffGate($request);
        $paper = $this->find($request->user(), $id);
        if ($paper->status !== 'draft') throw new BusinessException('a final paper cannot be changed', 'qb_paper_final', 422);
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
        $in = $request->validate(['strategy' => 'nullable|in:' . implode(',', QbPaperSets::STRATEGIES), 'set_names' => 'nullable|in:latin,bangla']);
        if ($paper->status !== 'draft') throw new BusinessException('already final', 'qb_paper_final', 422);
        if ($this->items($paper)->isEmpty()) throw new BusinessException('a paper needs at least one question', 'qb_paper_empty', 422);
        DB::transaction(function () use ($paper, $sets, $in) {
            $sets->freeze($paper, $this->sectionList($paper), (int) $paper->sets_count, $in['strategy'] ?? 'both', $in['set_names'] ?? 'latin');
            $paper->update(['status' => 'final']);
        });
        AuditLog::record('qb.paper.finalized', $paper, ['total_marks' => $paper->total_marks]);
        return response()->json(['success' => true, 'data' => $this->row($paper->fresh()), 'message' => __('messages.saved')]);
    }

    /** GET /question-bank/papers/{id}/pdf?set=A|B&answers=0|1[&format=json] */
    public function pdf(Request $request, int $id, PdfService $pdf)
    {
        $this->staffGate($request);
        $f = $request->validate(['set' => 'nullable|in:' . implode(',', QbPaperSets::LATIN), 'answers' => 'nullable|boolean', 'format' => 'nullable|in:json',
            'strategy' => 'nullable|in:' . implode(',', QbPaperSets::STRATEGIES), 'columns' => 'nullable|integer|in:1,2']);
        $paper = $this->find($request->user(), $id);
        $number = array_search($f['set'] ?? 'A', QbPaperSets::LATIN, true) + 1;
        if ($number > max(1, (int) $paper->sets_count)) throw new BusinessException('this paper has no such set', 'qb_no_such_set', 422);
        $data = $this->printable($paper, $number, (bool) ($f['answers'] ?? false), $f['strategy'] ?? 'both') + ['columns' => (int) ($f['columns'] ?? 1)];
        if (($f['format'] ?? null) === 'json') return response()->json(['success' => true, 'data' => $data]);
        $bytes = $pdf->render('pdf.qb-paper', ['paper' => $data], qbankFigures: true);   // D118 (4): graphs and diagrams drawn
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
            'instructions_json.subject_order.*' => 'integer', 'sets_count' => 'nullable|integer|min:1|max:' . QbPaperSets::MAX,   // D126 (2)
            'sections' => 'required|array|min:1|max:20', 'sections.*.title' => 'required|string|max:200', 'sections.*.instruction' => 'nullable|string|max:500',
            'sections.*.items' => 'present|array|max:100', 'sections.*.items.*.qb_question_id' => 'required|integer',
            'sections.*.items.*.marks' => ['required', 'regex:/^\d{1,3}(\.\d{1,2})?$/'],
            'status' => 'prohibited', 'total_marks' => 'prohibited',
        ]);
        $ids = collect($in['sections'])->flatMap(fn ($s) => collect($s['items'])->pluck('qb_question_id'));
        if ($ids->duplicates()->isNotEmpty()) throw \Illuminate\Validation\ValidationException::withMessages(['sections' => __('errors.qb_paper_duplicate')]);
        if (QbQuestion::whereIn('id', $ids)->count() !== $ids->unique()->count()) throw \Illuminate\Validation\ValidationException::withMessages(['sections' => __('errors.qb_no_such_item')]);
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
               'sections' => QbPaperSection::where('qb_paper_id', $p->id)->orderBy('sort_order')->get()->map(fn ($s) => ['id' => $s->id, 'title' => $s->title, 'instruction' => $s->instruction,
                   'items' => ($items[$s->id] ?? collect())->sortBy('sort_order')->map(fn ($i) => ['qb_question_id' => (int) $i->qb_question_id, 'marks' => $i->marks])->values()])->values()];
    }

    /** The paper as printed (D126 (2)): a final paper prints its frozen set; a draft previews the set computed the same way */
    private function printable(QbPaper $paper, int $number, bool $answers, string $strategy): array
    {
        $row = $this->row($paper);
        $frozen = $paper->status === 'final' ? QbPaperVariant::where('qb_paper_id', $paper->id)->where('variant_number', $number)->first() : null;
        $sets = app(QbPaperSets::class);
        $list = $this->sectionList($paper);
        $layout = $frozen?->layout_json ?? $sets->layout($paper, $list, $number, $strategy, $sets->optionCounts($list));
        $questions = QbQuestion::whereIn('id', collect($row['sections'])->flatMap(fn ($s) => collect($s['items'])->pluck('qb_question_id')))->get()->keyBy('id');
        $open = QbUnlock::where('item_type', 'question')->whereIn('item_id', $questions->keys())->pluck('item_id')->map(fn ($v) => (int) $v)->all();
        $marks = collect($row['sections'])->flatMap(fn ($s) => collect($s['items'])->mapWithKeys(fn ($it) => [$it['qb_question_id'] => $it['marks']]));
        $bySection = collect($row['sections'])->keyBy('id');
        $n = 0;
        $key = [];
        $subjectNames = collect($row['subjects'])->pluck('name', 'id');
        $sections = collect($layout)->map(function ($ls) use ($questions, $open, $answers, $marks, $bySection, $subjectNames, &$n, &$key) {
            $s = $bySection[$ls['section_id']] ?? ['title' => '', 'instruction' => null];
            $prev = null;
            return ['title' => $s['title'], 'instruction' => $s['instruction'], 'items' => collect($ls['items'])->filter(fn ($it) => isset($questions[$it['qb_question_id']]))->map(function ($it) use ($questions, $open, $answers, $marks, $subjectNames, &$n, &$key, &$prev) {
                $heading = null;                                 // D128: a subject block's heading over its first question
                if (isset($it['qb_subject_id']) && $it['qb_subject_id'] !== $prev) { $prev = $it['qb_subject_id']; $heading = $subjectNames[$it['qb_subject_id']] ?? ''; }
                $q = QbQuestionPublicResource::make($questions[$it['qb_question_id']], $answers && in_array($it['qb_question_id'], $open, true));
                $opts = $it['options'] === [] ? $q['options'] : array_values(array_filter(array_map(fn ($k) => $q['options'][$k] ?? null, $it['options'])));
                foreach ($opts as $k => &$o) $o['label'] = self::LABELS[$k] ?? (string) ($k + 1);   // relabelled by position
                unset($o);
                $no = ++$n;
                if (!empty($it['correct']) && $answers && in_array($it['qb_question_id'], $open, true)) $key[] = ['no' => $no, 'correct' => $it['correct']];   // bought only, like the answers
                return ['no' => $no, 'marks' => $marks[$it['qb_question_id']] ?? $it['marks'], 'subject' => $heading, 'question' => ['options' => $opts] + $q];
            })->values()->all()];
        })->all();
        return $paper->only(['id', 'title', 'exam_name', 'duration_minutes', 'total_marks']) + ['instructions' => $paper->instructions_json['text'] ?? null,
            'set' => QbPaperSets::LATIN[$number - 1], 'set_code' => $frozen?->code ?? QbPaperSets::LATIN[$number - 1], 'sets_count' => (int) $paper->sets_count,
            'answers' => $answers, 'institution' => Tenancy::current()->name, 'sections' => $sections,
            'answer_key' => $answers ? $key : [],   // D126 (4): the set's own key (frozen sets only), with the answers copy
            // R2.1.2: only the pictures the printed questions may show (the public shape already left out answer-only ones)
            'media' => self::pictures($questions->keys()->all(), collect($sections)->flatMap(fn ($s) => collect($s['items'])->flatMap(fn ($it) => array_column($it['question']['media'], 'id')))->all())];
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
        $subjectOf = QbQuestion::whereIn('id', $this->items($paper)->pluck('qb_question_id'))->pluck('qb_subject_id', 'id')->map(fn ($v) => (int) $v);
        $names = \App\Models\QbSubject::whereIn('id', $subjectOf->unique())->get()->keyBy('id');
        return array_map(fn ($id) => ['id' => $id, 'name' => $names->get($id)?->name_bn ?? $names->get($id)?->name_en], $this->subjectOrder($paper, $subjectOf));
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

    /** D101: department staff need their X-Department-Id context and this route's exact duty key on every request */
    private function staffGate(Request $request): void
    {
        if ($request->user()?->role === 'institution_staff') app(\App\Services\DepartmentRequestContextService::class)->forRoute($request);
    }
}

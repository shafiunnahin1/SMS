<?php

namespace App\Http\Controllers\QuestionBank;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{QbPaper, QbPaperFolder};
use Illuminate\Http\Request;

// D126 (1), R2.1.5: qbank's question-set folders for papers. A person's folders are their own (the head teacher's too); folders
// nest; a folder cannot move into itself or one of its own sub-folders; it is deleted only when it holds no folder and no paper.
// A paper the person can see (QB.8: a teacher's own, the head teacher's any) can be put into one of their folders or the top level.
class QbPaperFolderController extends Controller
{
    /** GET /question-bank/paper-folders: the person's folders, flat with parent ids and paper counts (the page draws the tree) */
    public function index(Request $request)
    {
        $folders = $this->own($request)->orderBy('name')->get(['id', 'parent_id', 'name']);
        $counts = QbPaper::whereIn('qb_paper_folder_id', $folders->pluck('id'))->selectRaw('qb_paper_folder_id, count(*) as n')->groupBy('qb_paper_folder_id')->pluck('n', 'qb_paper_folder_id');
        return response()->json(['success' => true, 'data' => $folders->map(fn ($f) => $f->only(['id', 'parent_id', 'name']) + ['papers' => (int) ($counts[$f->id] ?? 0)])->values()]);
    }

    /** POST /question-bank/paper-folders {name, parent_id?} */
    public function store(Request $request)
    {
        $in = $request->validate(['name' => 'required|string|max:150', 'parent_id' => 'nullable|integer']);
        if (!empty($in['parent_id'])) $this->find($request, (int) $in['parent_id']);
        $f = QbPaperFolder::create(['name' => trim($in['name']), 'parent_id' => $in['parent_id'] ?? null, 'created_by' => $request->user()->id]);
        return response()->json(['success' => true, 'data' => $f->only(['id', 'parent_id', 'name'])], 201);
    }

    /** PUT /question-bank/paper-folders/{id} {name?, parent_id?}: rename and/or move */
    public function update(Request $request, int $id)
    {
        $folder = $this->find($request, $id);
        $in = $request->validate(['name' => 'sometimes|string|max:150', 'parent_id' => 'sometimes|nullable|integer']);
        if (array_key_exists('parent_id', $in) && $in['parent_id'] !== null) {
            $this->find($request, (int) $in['parent_id']);
            for ($at = (int) $in['parent_id']; $at; $at = (int) QbPaperFolder::whereKey($at)->value('parent_id')) {   // walk up: never into itself or below
                if ($at === $folder->id) throw new BusinessException('a folder cannot move into itself or its own sub-folder', 'qb_folder_cycle', 422);
            }
        }
        $folder->update(collect($in)->map(fn ($v, $k) => $k === 'name' ? trim($v) : $v)->all());
        return response()->json(['success' => true, 'data' => $folder->only(['id', 'parent_id', 'name'])]);
    }

    /** DELETE /question-bank/paper-folders/{id}: only an empty folder */
    public function destroy(Request $request, int $id)
    {
        $folder = $this->find($request, $id);
        if (QbPaperFolder::where('parent_id', $folder->id)->exists() || QbPaper::where('qb_paper_folder_id', $folder->id)->exists()) {
            throw new BusinessException('only an empty folder can be deleted', 'qb_folder_not_empty', 422);
        }
        $folder->delete();
        return response()->json(['success' => true]);
    }

    /** PUT /question-bank/papers/{id}/folder {folder_id|null} */
    public function movePaper(Request $request, int $id)
    {
        $user = $request->user();
        $paper = ($user->role === 'admin' ? QbPaper::query() : QbPaper::where('created_by', $user->id))->findOrFail($id);   // 404 before anything else
        $in = $request->validate(['folder_id' => 'present|nullable|integer']);
        if ($in['folder_id'] !== null) $this->find($request, (int) $in['folder_id']);
        $paper->update(['qb_paper_folder_id' => $in['folder_id']]);
        return response()->json(['success' => true, 'data' => ['id' => $paper->id, 'folder_id' => $paper->qb_paper_folder_id]]);
    }

    private function own(Request $request)
    {
        return QbPaperFolder::where('created_by', $request->user()->id);
    }

    private function find(Request $request, int $id): QbPaperFolder
    {
        return $this->own($request)->findOrFail($id);   // another person's folder, or another institution's: 404
    }
}

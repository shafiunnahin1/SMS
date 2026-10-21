<?php

namespace App\Http\Controllers\QuestionBank;

use App\Http\Controllers\Controller;
use App\Services\QbQuestionFinderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// R2.1.2 / D114 (3): qbank's question finder for the writers' panel (content writers, moderators, the Super Admin) - the text of
// a question in, the closest published questions out in qbank's response shape, no answers. 5 to 5,000 characters, as qbank.
class QbFinderController extends Controller
{
    /** POST /writer/question-finder {text, qb_class_level_id?, qb_subject_id?, qb_chapter_id?, qb_topic_id?, qb_question_type_id?, language?} */
    public function search(Request $request, QbQuestionFinderService $finder): JsonResponse
    {
        $in = $request->validate([
            'text' => ['required', 'string', 'min:5', 'max:5000'],
            'qb_class_level_id' => ['nullable', 'integer', 'exists:qb_class_levels,id'],
            'qb_subject_id' => ['nullable', 'integer', 'exists:qb_subjects,id'],
            'qb_chapter_id' => ['nullable', 'integer', 'exists:qb_chapters,id'],
            'qb_topic_id' => ['nullable', 'integer', 'exists:qb_topics,id'],
            'curriculum_node_id' => ['nullable', 'integer', 'exists:qb_curriculum_nodes,id'],
            'qb_question_type_id' => ['nullable', 'integer', 'exists:qb_question_types,id'],
            'language' => ['nullable', 'in:bn,en'],
        ]);
        return response()->json($finder->search(trim($in['text']), $in));
    }
}

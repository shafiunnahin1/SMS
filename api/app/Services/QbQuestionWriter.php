<?php

namespace App\Services;

use App\Models\{QbChapter, QbMedia, QbQuestion, QbQuestionRevision, QbTopic, User};
use Illuminate\Validation\ValidationException;

// QB.2/QB.3/QB.4 (moved here unchanged from QbQuestionController for D123): how a question and its parts are saved - the
// curriculum placement check, the child lists, the revision snapshot - shared by the editor and the import's "import selected".
class QbQuestionWriter
{
    public const CHILDREN = ['class_level_ids', 'options', 'creative_parts', 'occurrences', 'media_ids', 'stimuli', 'items'];

    /** The chapter must belong to the subject and the topic to the chapter (a topic alone fills in its chapter) */
    public function placed(array $in): array
    {
        if (!empty($in['qb_topic_id'])) {
            $chapter = QbTopic::find($in['qb_topic_id'])->qb_chapter_id;
            if (!empty($in['qb_chapter_id']) && (int) $in['qb_chapter_id'] !== (int) $chapter) throw ValidationException::withMessages(['qb_topic_id' => __('errors.qb_topic_mismatch')]);
            $in['qb_chapter_id'] = $chapter;
        }
        if (!empty($in['qb_chapter_id']) && (int) QbChapter::find($in['qb_chapter_id'])->qb_subject_id !== (int) $in['qb_subject_id']) {
            throw ValidationException::withMessages(['qb_chapter_id' => __('errors.qb_chapter_mismatch')]);
        }
        return $in;
    }

    /** Replace each list that came in the request (absent = unchanged); pictures must be the editor's own uploads or already on it */
    public function children(QbQuestion $q, array $in, User $user): void
    {
        if (array_key_exists('class_level_ids', $in)) $q->classLevels()->sync($in['class_level_ids']);
        if (array_key_exists('options', $in)) {
            $q->options()->delete();
            foreach (array_values($in['options']) as $i => $o) $q->options()->create(['label' => $o['label'], 'content_text' => $o['content_text'],
                'content_json' => $o['content_json'] ?? null, 'is_correct' => (bool) $o['is_correct'], 'sort_order' => $i]);
        }
        if (array_key_exists('creative_parts', $in)) {
            $q->creativeParts()->delete();
            foreach (array_values($in['creative_parts']) as $i => $p) $q->creativeParts()->create(collect($p)->only(['part_label', 'cognitive_level', 'marks',
                'question_text', 'question_json', 'answer_text', 'answer_json'])->all() + ['sort_order' => $i]);
        }
        if (array_key_exists('stimuli', $in) || array_key_exists('items', $in)) {       // QB.4: one list of each, replaced together
            $q->items()->delete();
            $stimuli = [];
            if (array_key_exists('stimuli', $in)) {
                $q->stimuli()->delete();
                foreach (array_values($in['stimuli']) as $i => $st) $stimuli[$i] = $q->stimuli()->create(['label' => $st['label'] ?? null, 'content_text' => $st['content_text'] ?? null,
                    'content_json' => $st['content_json'] ?? null, 'sort_order' => $i])->id;
            } else {
                $stimuli = $q->stimuli()->pluck('id')->all();
            }
            foreach (array_values($in['items'] ?? []) as $i => $it) {
                $sid = isset($it['stimulus_index']) ? ($stimuli[$it['stimulus_index']] ?? null) : null;
                if (isset($it['stimulus_index']) && !$sid) throw ValidationException::withMessages(["items.{$i}.stimulus_index" => __('errors.qb_no_such_stimulus')]);
                $q->items()->create(['qb_question_stimulus_id' => $sid, 'item_type' => $it['item_type'], 'prompt_text' => $it['prompt_text'] ?? null,
                    'prompt_json' => $it['prompt_json'] ?? null, 'answer_json' => $it['answer_json'] ?? null, 'marks' => $it['marks'] ?? 0, 'sort_order' => $i]);
            }
        }
        if (array_key_exists('occurrences', $in)) {
            $q->occurrences()->delete();
            foreach ($in['occurrences'] as $o) $q->occurrences()->create(collect($o)->only(['board', 'institution_name', 'exam_type', 'year', 'note'])->all());
        }
        if (array_key_exists('media_ids', $in)) {
            $linked = $q->media()->pluck('qb_media.id')->all();
            $foreign = QbMedia::whereIn('id', $in['media_ids'])->whereNotIn('id', $linked)->where('uploaded_by', '!=', $user->id)->exists();
            if ($foreign && $user->role !== 'super_admin') throw ValidationException::withMessages(['media_ids' => __('errors.qb_media_not_yours')]);
            $q->media()->sync($in['media_ids']);
        }
    }

    public function revision(QbQuestion $q, User $user): void
    {
        $q->refresh();
        QbQuestionRevision::create(['qb_question_id' => $q->id, 'edited_by' => $user->id,
            'snapshot' => $q->only(['qb_question_type_id', 'qb_subject_id', 'qb_chapter_id', 'qb_topic_id', 'difficulty', 'marks', 'language', 'content_mode',
                'question_json', 'question_text', 'answer_json', 'answer_text', 'explanation_json', 'explanation_text', 'status'])
                + ['class_level_ids' => $q->classLevels()->pluck('qb_class_levels.id')->all()] + $this->parts($q)]);
    }

    /** The parts with their answers - the writers' panel only; an institution or a student gets QbQuestionPublicResource */
    public function parts(QbQuestion $q): array
    {
        return [
            'options' => $q->options()->get(['label', 'content_text', 'content_json', 'is_correct'])->map(fn ($o) => ['label' => $o->label, 'content_text' => $o->content_text,
                'content_json' => $o->content_json, 'is_correct' => (bool) $o->is_correct])->all(),
            'creative_parts' => $q->creativeParts()->get()->map(fn ($p) => $p->only(['part_label', 'cognitive_level', 'marks', 'question_text', 'question_json', 'answer_text', 'answer_json']))->all(),
            'occurrences' => $q->occurrences()->get()->map(fn ($o) => $o->only(['board', 'institution_name', 'exam_type', 'year', 'note']))->all(),
            'media_ids' => $q->media()->pluck('qb_media.id')->all(),
            'stimuli' => $q->stimuli()->get()->map(fn ($st) => ['id' => $st->id] + $st->only(['label', 'content_text', 'content_json']))->all(),
            'items' => $q->items()->get()->map(fn ($it) => $it->only(['item_type', 'prompt_text', 'prompt_json', 'answer_json', 'marks', 'qb_question_stimulus_id']))->all(),
        ];
    }

    /** The eager-loaded child data for the writer's question cards. */
    public function previewParts(QbQuestion $q): array
    {
        return [
            'options' => $q->options->map(fn ($o) => ['label' => $o->label, 'content_text' => $o->content_text,
                'content_json' => $o->content_json, 'is_correct' => (bool) $o->is_correct])->all(),
            'creative_parts' => $q->creativeParts->map(fn ($p) => $p->only(['part_label', 'cognitive_level', 'marks', 'question_text', 'question_json', 'answer_text', 'answer_json']))->all(),
            'occurrences' => $q->occurrences->map(fn ($o) => $o->only(['board', 'institution_name', 'exam_type', 'year', 'note']))->all(),
            'stimuli' => $q->stimuli->map(fn ($st) => ['id' => $st->id] + $st->only(['label', 'content_text', 'content_json']))->all(),
            'items' => $q->items->map(fn ($it) => $it->only(['item_type', 'prompt_text', 'prompt_json', 'answer_json', 'marks', 'qb_question_stimulus_id']))->all(),
        ];
    }
}

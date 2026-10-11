<?php

namespace App\Http\Resources;

use App\Http\Controllers\QuestionBank\QbMediaController;
use App\Models\{QbConcept, QbResource};

// QB.5 (D65, docs/modules/question-bank.md §2, §4.1): the ONE shape in which a concept or a resource leaves the writers' panel -
// for an institution's teachers (and students, QB.9). Concepts, slides, books and PDFs are paid: without an unlock (qb_unlocks,
// or a free rule from QB.6) a concept is its title only - no body, no pictures - and a resource its title, kind, place, page count
// and preview pages - never the file. QbLibraryTest checks both shapes.
final class QbContentPublicResource
{
    public static function concept(QbConcept $c, bool $unlocked, bool $full = true): array
    {
        $out = $c->only(['id', 'qb_topic_id', 'title_bn', 'title_en', 'sort_order']) + ['unlocked' => $unlocked];
        if (!$unlocked || !$full) return $out;
        return $out + $c->only(['body_text', 'body_json']) + ['media' => $c->media()->get()->map(fn ($m) => QbMediaController::view($m))->values()->all()];
    }

    public static function resource(QbResource $r, bool $unlocked, bool $full = true): array
    {
        $out = $r->only(['id', 'kind', 'title_bn', 'title_en', 'qb_subject_id', 'qb_chapter_id', 'qb_topic_id', 'page_count']) + ['unlocked' => $unlocked];
        if (!$full) return $out;
        $out['previews'] = $r->previews()->get()->map(fn ($m) => QbMediaController::view($m))->values()->all();
        return $unlocked && $r->file ? $out + ['file' => QbMediaController::view($r->file)] : $out;
    }
}

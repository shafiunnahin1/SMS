<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D126 (2), R2.1.5: one frozen set of a final paper (qbank's subset) - institution data
class QbPaperVariant extends Model
{
    use BelongsToInstitution;

    protected static function booted(): void
    {
        static::creating(function (self $row) {               // D180 (5): no revision named = the paper's latest
            if (!$row->qb_paper_revision_id && $row->qb_paper_id) $row->qb_paper_revision_id = QbPaperRevision::latestOrFirst((int) $row->qb_paper_id)->id;
        });
    }

    protected $fillable = ['institution_id', 'qb_paper_id', 'qb_paper_revision_id', 'variant_number', 'code', 'strategy', 'layout_json'];
    protected $casts = ['layout_json' => 'array'];

    /** D180: the sets of one revision of the paper - by default its latest (current) revision; none for a draft */
    public static function current(QbPaper $paper, ?int $revisionId = null)
    {
        return static::where('qb_paper_id', $paper->id)->where('qb_paper_revision_id', $revisionId ?? $paper->currentRevisionId());
    }
}

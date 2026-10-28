<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D180 (5) QBO.2: one immutable snapshot of a final paper's settings; it owns its frozen sets and its OMR form - institution data.
// Never updated or deleted: a changed setting makes the next revision.
class QbPaperRevision extends Model
{
    use BelongsToInstitution;

    /** the settings a revision snapshots (D180 (1)'s red block) */
    public const SETTINGS = ['title', 'exam_name', 'duration_minutes', 'sets_count', 'instructions_json'];

    protected $fillable = ['institution_id', 'qb_paper_id', 'revision_number', 'settings_json', 'created_by'];
    protected $casts = ['settings_json' => 'array', 'revision_number' => 'integer'];

    /** D180 (5): the paper's latest revision, made as revision 1 (its current settings) when it has none yet - a frozen set or an OMR
     *  form always belongs to a revision */
    public static function latestOrFirst(int $paperId): self
    {
        $paper = QbPaper::findOrFail($paperId);
        return $paper->currentRevision() ?? static::create(['qb_paper_id' => $paper->id, 'revision_number' => 1, 'settings_json' => $paper->settingsSnapshot(),
            'created_by' => $paper->created_by]);
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new \LogicException('a paper revision is immutable'));
        static::deleting(fn () => throw new \LogicException('a paper revision is immutable'));
    }
}

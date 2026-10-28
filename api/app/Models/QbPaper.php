<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (institution data) - docs/modules/question-bank.md §3
class QbPaper extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'created_by', 'title', 'program_id', 'qb_subject_id', 'exam_name', 'duration_minutes', 'total_marks', 'instructions_json', 'status', 'sets_count', 'qb_paper_folder_id'];
    protected $casts = ['total_marks' => 'decimal:2', 'instructions_json' => 'array'];

    /** D180: the paper's settings revisions, oldest first (none while it is a draft) */
    public function revisions()
    {
        return $this->hasMany(QbPaperRevision::class)->orderBy('revision_number');
    }

    /** D180: the latest revision (the current settings, sets and OMR form), or null for a draft */
    public function currentRevision(): ?QbPaperRevision
    {
        return QbPaperRevision::where('qb_paper_id', $this->id)->orderByDesc('revision_number')->first();
    }

    /** D180: the id of the latest revision; a final paper without one (made before revisions) gets revision 1 now; 0 for a draft */
    public function currentRevisionId(): int
    {
        return $this->currentRevision()?->id ?? ($this->status === 'final' ? QbPaperRevision::latestOrFirst($this->id)->id : 0);
    }

    /** D180 (5): this paper's settings as a revision snapshot */
    public function settingsSnapshot(): array
    {
        return ['title' => $this->title, 'exam_name' => $this->exam_name, 'duration_minutes' => $this->duration_minutes === null ? null : (int) $this->duration_minutes,
            'sets_count' => (int) $this->sets_count, 'instructions_json' => $this->instructions_json];
    }
}

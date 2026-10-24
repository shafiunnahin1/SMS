<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// D158 (3) / D159: a question paper (or one subject block of it) linked to one exam subject
class ExamPaper extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'exam_subject_id', 'qb_paper_id', 'qb_subject_id', 'linked_by'];

    public function examSubject(): BelongsTo { return $this->belongsTo(ExamSubject::class); }
    public function paper(): BelongsTo { return $this->belongsTo(QbPaper::class, 'qb_paper_id'); }
}

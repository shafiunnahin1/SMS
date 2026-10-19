<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D126 (R2.1.5): a folder of question papers (qbank's question-set folders) - institution data, a person's own
class QbPaperFolder extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'parent_id', 'name', 'created_by'];
}

<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D126 (2), R2.1.5: one frozen set of a final paper (qbank's subset) - institution data
class QbPaperVariant extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'qb_paper_id', 'variant_number', 'code', 'strategy', 'layout_json'];
    protected $casts = ['layout_json' => 'array'];
}

<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

// D126 (3), R2.1.5: qbank's assessment blueprint - a platform plan (Super Admin) a teacher builds a paper from
class QbBlueprint extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'all';   // read-only from an institution's host

    protected $table = 'qb_blueprints';
    protected $fillable = ['name_bn', 'name_en', 'qb_class_level_id', 'qb_subject_id', 'exam_type', 'total_marks', 'duration_minutes', 'is_active', 'created_by'];
    protected $casts = ['total_marks' => 'decimal:2', 'is_active' => 'boolean'];

    public function items(): HasMany
    {
        return $this->hasMany(QbBlueprintItem::class)->orderBy('sort_order')->orderBy('id');
    }
}

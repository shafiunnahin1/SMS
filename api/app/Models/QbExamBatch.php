<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D165 (3) ST.2: an SSC / HSC exam batch (e.g. "SSC 2027") with the classes it covers and its exam end date - the Super Admin's
class QbExamBatch extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'all';   // read-only from an institution's host

    protected $fillable = ['name', 'kind', 'class_level_ids', 'exam_ends_on', 'is_active'];
    protected $casts = ['class_level_ids' => 'array', 'exam_ends_on' => 'date', 'is_active' => 'boolean'];
}

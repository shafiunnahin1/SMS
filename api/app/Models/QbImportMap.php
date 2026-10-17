<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D69 (QB.11): a platform row - which qbank row became which question-bank row here (written only by qb:import-from-qbank)
class QbImportMap extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'none';   // never read from an institution's host

    const UPDATED_AT = null;

    protected $table = 'qb_import_map';
    protected $fillable = ['source', 'source_table', 'source_id', 'target_table', 'target_id'];
}

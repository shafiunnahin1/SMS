<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

// D123 (R2.1.3): one JSON/TOON question import, staged before anything enters the question bank
class QbImportBatch extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'none';   // never read from an institution's host: writers' unreviewed uploads

    protected $table = 'qb_import_batches';

    protected $fillable = ['uuid', 'format', 'schema_version', 'files', 'source_sha256', 'status', 'total_records', 'parsed_records', 'valid_records',
        'invalid_records', 'duplicate_records', 'imported_records', 'error', 'created_by'];

    protected $casts = ['files' => 'array'];

    public function records(): HasMany
    {
        return $this->hasMany(QbImportRecord::class);
    }
}

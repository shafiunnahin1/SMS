<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// D123 (R2.1.3): one staged question of an import batch - the canonical record, its field-path errors and the reviewer's choices
class QbImportRecord extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'none';

    protected $table = 'qb_import_records';

    protected $fillable = ['qb_import_batch_id', 'file_index', 'record_index', 'type_slug', 'payload', 'errors', 'warnings', 'has_math',
        'duplicate_status', 'duplicate_question_id', 'selected', 'qb_question_id'];

    protected $casts = ['payload' => 'array', 'errors' => 'array', 'warnings' => 'array', 'has_math' => 'boolean', 'selected' => 'boolean'];

    public function batch(): BelongsTo
    {
        return $this->belongsTo(QbImportBatch::class, 'qb_import_batch_id');
    }
}

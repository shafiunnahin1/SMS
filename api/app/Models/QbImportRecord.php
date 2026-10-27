<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// D123 (R2.1.3): one staged question of an import batch - the canonical record, its field-path errors and the reviewer's choices
class QbImportRecord extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'none';

    protected $table = 'qb_import_records';

    protected $fillable = ['qb_import_batch_id', 'file_index', 'record_index', 'page_number', 'type_slug', 'payload', 'errors', 'warnings', 'has_math',
        'duplicate_status', 'duplicate_question_id', 'selected', 'qb_question_id'];

    protected $casts = ['errors' => 'array', 'warnings' => 'array', 'has_math' => 'boolean', 'selected' => 'boolean'];

    /** D150 occurrence fields in their fixed order (D172: MySQL JSON does not keep key order) */
    private const OCCURRENCE_ORDER = ['note', 'institution_name', 'board', 'exam_type', 'year', 'question_number', 'set_label', 'page_reference'];

    /** the canonical record as JSON; each occurrence comes back with its keys in the fixed field order (unknown keys after) */
    protected function payload(): Attribute
    {
        return Attribute::make(
            get: function ($value) {
                $payload = $value === null ? null : json_decode($value, true);
                if (is_array($payload['occurrences'] ?? null)) {
                    $payload['occurrences'] = array_map(fn ($o) => is_array($o) ? array_merge(array_intersect_key(array_flip(self::OCCURRENCE_ORDER), $o), $o) : $o, $payload['occurrences']);
                }
                return $payload;
            },
            set: fn ($value) => $value === null ? null : json_encode($value),
        );
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(QbImportBatch::class, 'qb_import_batch_id');
    }
}

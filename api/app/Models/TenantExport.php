<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D193 EXP.1 (D38): one export (the institution's admin) or backup (the Super Admin) of an institution's data - an encrypted file
// on the private disk, downloadable once until expires_at
class TenantExport extends Model
{
    use BelongsToInstitution;

    public const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'kind', 'status', 'format_version', 'include_secrets', 'tables_count', 'rows_count', 'file_path',
        'size_bytes', 'checksum', 'requested_by', 'error', 'finished_at', 'expires_at'];
    protected $casts = ['include_secrets' => 'boolean', 'finished_at' => 'datetime', 'expires_at' => 'datetime', 'created_at' => 'datetime'];
}

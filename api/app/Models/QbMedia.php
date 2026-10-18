<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform catalogue) - docs/modules/question-bank.md §3
class QbMedia extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'all';   // read-only from an institution's host

    const UPDATED_AT = null;

    protected $table = 'qb_media';

    protected $fillable = ['path', 'mime', 'size_bytes', 'uploaded_by'];
}

<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D210 MEMO.1: one memo file per document kind and year; its 22-digit number is frozen when it is opened
class MemoFile extends Model
{
    use BelongsToInstitution;

    public const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'doc_kind', 'subject_code', 'file_serial', 'year', 'file_no', 'next_issue'];

    protected static function booted(): void
    {
        static::deleting(fn () => throw new \LogicException('memo files are never deleted (D210)'));
    }
}

<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D210 LTR.1: one official letter of the institution with its memo number. Never deleted; a cancelled letter keeps its row.
class OfficialLetter extends Model
{
    use BelongsToInstitution;

    public const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'memo_no', 'subject', 'recipient', 'body', 'issued_date', 'issued_by', 'status'];
    protected $casts = ['issued_date' => 'date', 'created_at' => 'datetime'];

    protected static function booted(): void
    {
        static::deleting(fn () => throw new \LogicException('official letters are never deleted (D210)'));
    }
}

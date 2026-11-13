<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D210 MEMO.1: one issued memo number. Never deleted or reused; a cancelled document keeps its number as `cancelled`.
class MemoNumber extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'memo_file_id', 'issue_no', 'memo_no', 'doc_kind', 'source_key', 'recipient', 'status', 'issued_by', 'issued_at', 'cancelled_at', 'cancel_reason'];
    protected $casts = ['issued_at' => 'datetime', 'cancelled_at' => 'datetime'];

    protected static function booted(): void
    {
        static::deleting(fn () => throw new \LogicException('memo numbers are never deleted (D210)'));
    }

    public function file() { return $this->belongsTo(MemoFile::class, 'memo_file_id'); }
}

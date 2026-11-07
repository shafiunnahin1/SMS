<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

// D193 NTC.1 (docs/modules/communication-plus.md §৫, academic-structure.md "Targeting Rule"): a notice for everyone, students,
// teachers or parents, optionally narrowed to a program / one batch (both NULL = the whole institution). A future `published_at`
// keeps it hidden from its readers until then; `require_ack` asks each reader to acknowledge it. Soft deleted (R7).
class Notice extends Model
{
    use BelongsToInstitution, SoftDeletes;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'title', 'content', 'target', 'program_id', 'batch_id', 'published_at', 'created_by', 'require_ack', 'ack_deadline'];
    protected $casts = ['published_at' => 'datetime', 'ack_deadline' => 'date', 'require_ack' => 'boolean', 'is_public' => 'boolean'];

    public function receipts() { return $this->hasMany(NoticeReceipt::class); }
    public function program() { return $this->belongsTo(Program::class); }
    public function batch() { return $this->belongsTo(Batch::class); }
}

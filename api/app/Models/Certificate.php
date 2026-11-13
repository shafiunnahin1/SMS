<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D210 CERT.1: one certificate (attestation, testimonial, participation, merit, appreciation, completion). Never deleted; a cancelled
// one has revoked_at (the public verify page then says revoked).
class Certificate extends Model
{
    use BelongsToInstitution;

    public const UPDATED_AT = null;
    public const TYPES = ['attestation', 'testimonial', 'participation', 'merit', 'appreciation', 'completion'];
    protected $fillable = ['institution_id', 'student_id', 'type', 'title', 'description', 'issued_date', 'issued_by', 'certificate_no', 'pdf_path', 'memo_no', 'verify_code', 'revoked_at'];
    protected $casts = ['issued_date' => 'date', 'revoked_at' => 'datetime', 'created_at' => 'datetime'];

    protected static function booted(): void
    {
        static::deleting(fn () => throw new \LogicException('certificates are never deleted (D210)'));
    }

    public function student() { return $this->belongsTo(Student::class); }

    /** memo kind: attestation and testimonial have their own subject codes, the rest share `certificate` */
    public function memoKind(): string
    {
        return in_array($this->type, ['attestation', 'testimonial'], true) ? $this->type : 'certificate';
    }
}

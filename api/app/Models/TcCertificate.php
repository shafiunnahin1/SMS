<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D210 PTC.1: one transfer certificate. Never deleted; a cancelled TC has revoked_at (its memo number is cancelled too).
class TcCertificate extends Model
{
    use BelongsToInstitution;

    public const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'student_id', 'tc_number', 'reason', 'last_class', 'last_attendance_date', 'conduct', 'issued_date', 'issued_by', 'memo_no', 'verify_code', 'revoked_at'];
    protected $casts = ['last_attendance_date' => 'date', 'issued_date' => 'date', 'revoked_at' => 'datetime', 'created_at' => 'datetime'];

    protected static function booted(): void
    {
        static::deleting(fn () => throw new \LogicException('transfer certificates are never deleted (D210)'));
    }

    public function student() { return $this->belongsTo(Student::class); }
}

<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D214 MAD.1 (docs/modules/madrasa.md section 1.1): one hifz session - sabaq (new lesson), sabqi (recent revision), manzil (older revision)
class HifzRecord extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;
    public const KINDS = ['sabaq', 'sabqi', 'manzil'];

    protected $fillable = ['institution_id', 'student_id', 'teacher_id', 'record_date', 'kind', 'from_surah', 'from_ayah', 'to_surah', 'to_ayah', 'para_no', 'pages', 'quality', 'mistakes', 'remarks'];

    protected $casts = ['record_date' => 'date', 'pages' => 'decimal:1', 'from_surah' => 'integer', 'from_ayah' => 'integer', 'to_surah' => 'integer', 'to_ayah' => 'integer',
        'para_no' => 'integer', 'quality' => 'integer', 'mistakes' => 'integer'];

    public function student() { return $this->belongsTo(Student::class); }
    public function teacher() { return $this->belongsTo(Teacher::class); }
}

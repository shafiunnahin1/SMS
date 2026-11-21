<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D243 ALM.1: a former student (table `alumni`); kept by the admin; the public directory shows only verified entries and never contact data
class Alumnus extends Model
{
    use BelongsToInstitution;

    protected $table = 'alumni';
    const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'student_id', 'name', 'graduation_year', 'last_class', 'current_institution', 'current_profession', 'email', 'phone', 'address', 'achievements', 'is_verified'];
    protected $casts = ['graduation_year' => 'integer', 'is_verified' => 'boolean', 'created_at' => 'datetime'];

    public function student() { return $this->belongsTo(Student::class); }
}

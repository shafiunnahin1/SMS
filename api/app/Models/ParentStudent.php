<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class ParentStudent extends Model
{
    use BelongsToInstitution;

    protected $table = 'parent_student';

    public $timestamps = false;

    protected $fillable = [
        'institution_id',
        'parent_user_id',
        'student_id',
        'relationship',
        'is_primary',
    ];

    protected $casts = [
        'is_primary' => 'boolean',
    ];

    public function parent() { return $this->belongsTo(User::class, 'parent_user_id'); }
    public function student() { return $this->belongsTo(Student::class); }
}

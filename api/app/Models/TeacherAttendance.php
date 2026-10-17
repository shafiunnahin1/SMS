<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TeacherAttendance extends Model
{
    use BelongsToInstitution, HasFactory;
    public $timestamps = false;
    protected $fillable = ['institution_id', 'teacher_id', 'date', 'status', 'check_in', 'check_out', 'note', 'marked_by'];
    protected $casts = ['date' => 'date'];
}

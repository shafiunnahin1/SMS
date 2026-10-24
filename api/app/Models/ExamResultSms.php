<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D161 (4): a result or correction SMS of an exam and what became of it (pending until the wallet can pay)
class ExamResultSms extends Model
{
    use BelongsToInstitution;

    protected $table = 'exam_result_sms';
    protected $fillable = ['institution_id', 'exam_id', 'student_id', 'kind', 'phone', 'message', 'status', 'sms_log_id', 'error', 'attempts', 'created_by'];
}

<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D227 LIB.1: issued -> (overdue) -> returned; the fine is computed by the server on return
class BookIssue extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'book_id', 'student_id', 'issued_by', 'issue_date', 'due_date', 'return_date', 'fine_amount', 'fine_paid', 'status'];
    protected $casts = ['issue_date' => 'date:Y-m-d', 'due_date' => 'date:Y-m-d', 'return_date' => 'date:Y-m-d', 'fine_amount' => 'decimal:2', 'fine_paid' => 'boolean'];

    public function book() { return $this->belongsTo(Book::class); }
    public function student() { return $this->belongsTo(Student::class); }
}

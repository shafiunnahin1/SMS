<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D227 LIB.1: a library book; available_copies = total_copies - the copies out
class Book extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'title', 'author', 'isbn', 'category', 'total_copies', 'available_copies', 'shelf_location', 'published_year'];
    protected $casts = ['total_copies' => 'integer', 'available_copies' => 'integer', 'published_year' => 'integer', 'created_at' => 'datetime'];

    public function issues() { return $this->hasMany(BookIssue::class); }
}

<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;
use LogicException;

class StaffMappingReview extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = [
        'institution_id', 'user_id', 'teacher_id', 'staff_member_id', 'decision', 'reviewed_by', 'reviewed_at', 'note',
    ];

    protected $casts = ['reviewed_at' => 'datetime'];

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Staff mapping reviews are append-only'));
        static::deleting(fn () => throw new LogicException('Staff mapping reviews are append-only'));
    }
}
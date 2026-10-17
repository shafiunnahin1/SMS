<?php

namespace App\Models;

use App\Exceptions\BusinessException;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CashBookClosing extends Model
{
    use BelongsToInstitution, HasFactory;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'date', 'revision', 'opening_cash', 'cash_in', 'cash_out', 'expected_closing',
        'counted_cash', 'difference', 'status', 'note', 'closed_by', 'closed_at', 'reopened_by', 'reopened_at', 'reopen_reason'];
    protected $casts = ['date' => 'date', 'revision' => 'integer', 'opening_cash' => 'decimal:2', 'cash_in' => 'decimal:2',
        'cash_out' => 'decimal:2', 'expected_closing' => 'decimal:2', 'counted_cash' => 'decimal:2', 'difference' => 'decimal:2',
        'closed_at' => 'datetime', 'reopened_at' => 'datetime'];

    protected static function booted(): void
    {
        static::updating(fn () => throw new BusinessException(__('errors.cashbook_immutable'), 'cashbook_immutable', 409));
        static::deleting(fn () => throw new BusinessException(__('errors.cashbook_immutable'), 'cashbook_immutable', 409));
    }
}

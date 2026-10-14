<?php

namespace App\Models;

use App\Exceptions\BusinessException;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Expense extends Model
{
    use BelongsToInstitution, HasFactory;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'category', 'title', 'amount', 'expense_date', 'note', 'receipt_path', 'added_by',
        'payment_method', 'source', 'payroll_run_id', 'fund_id', 'reversal_of_id', 'replaces_expense_id'];
    protected $casts = ['amount' => 'decimal:2', 'expense_date' => 'date', 'created_at' => 'datetime', 'reversals_exists' => 'boolean'];

    protected static function booted(): void
    {
        static::updating(fn () => throw new BusinessException(__('errors.expense_immutable'), 'expense_immutable', 409));
        static::deleting(fn () => throw new BusinessException(__('errors.expense_immutable'), 'expense_immutable', 409));
    }

    public function reversals() { return $this->hasMany(self::class, 'reversal_of_id'); }
}

<?php

namespace App\Models;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SalaryRevision extends Model
{
    use BelongsToInstitution, HasFactory;
    public $timestamps = false;
    protected $fillable = ['institution_id','payee_type','payee_id','kind','batch_id','batch_label','change_mode','change_value','target','old_basic','new_basic','old_gross','new_gross','calculation_snapshot','effective_from','reason','arrears_policy','status','proposed_by','approved_by','approved_at','acknowledged_path','letter_no'];
    protected $casts = ['change_value'=>'decimal:2','old_basic'=>'decimal:2','new_basic'=>'decimal:2','old_gross'=>'decimal:2','new_gross'=>'decimal:2','calculation_snapshot'=>'array','effective_from'=>'date','approved_at'=>'datetime'];
    protected $hidden = ['calculation_snapshot','acknowledged_path'];
    protected static function booted(): void
    {
        static::updating(function ($row) {
            $allowed=['status','approved_by','approved_at','acknowledged_path','letter_no'];
            if ($row->getOriginal('status') === 'applied' || array_diff(array_keys($row->getDirty()),$allowed)) {
                throw new \App\Exceptions\BusinessException(__('salary.immutable'),'salary_immutable',409);
            }
        });
        static::deleting(fn () => throw new \App\Exceptions\BusinessException(__('salary.immutable'),'salary_immutable',409));
    }
}

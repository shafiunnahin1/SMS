<?php

namespace App\Models;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SalaryStructure extends Model
{
    use BelongsToInstitution, HasFactory;
    public $timestamps = false;
    protected $fillable = ['institution_id','payee_type','payee_id','basic','gross','effective_from','effective_to','designation','grade','revision_id','created_by'];
    protected $casts = ['basic'=>'decimal:2','gross'=>'decimal:2','effective_from'=>'date','effective_to'=>'date'];
    protected static function booted(): void
    {
        static::updating(fn () => throw new \App\Exceptions\BusinessException(__('salary.immutable'),'salary_immutable',409));
        static::deleting(fn () => throw new \App\Exceptions\BusinessException(__('salary.immutable'),'salary_immutable',409));
    }
}

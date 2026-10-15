<?php

namespace App\Models;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SalaryStructureLine extends Model
{
    use BelongsToInstitution, HasFactory;
    public $timestamps = false;
    protected $fillable = ['institution_id','structure_id','component_id','mode','value'];
    protected $casts = ['value'=>'decimal:2'];
    protected static function booted(): void
    {
        static::updating(fn () => throw new \App\Exceptions\BusinessException(__('salary.immutable'),'salary_immutable',409));
        static::deleting(fn () => throw new \App\Exceptions\BusinessException(__('salary.immutable'),'salary_immutable',409));
    }
}

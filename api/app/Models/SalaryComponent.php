<?php

namespace App\Models;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SalaryComponent extends Model
{
    use BelongsToInstitution, HasFactory;
    public $timestamps = false;
    protected $fillable = ['institution_id','code','name','type','calc','taxable','is_pf','is_system','is_active','sort_order'];
    protected $casts = ['name'=>'array','taxable'=>'boolean','is_pf'=>'boolean','is_system'=>'boolean','is_active'=>'boolean'];
    protected static function booted(): void
    {
        static::updating(function ($row) {
            if (SalaryStructureLine::where('component_id',$row->id)->exists() && array_diff(array_keys($row->getDirty()),['is_active','sort_order'])) {
                throw new \App\Exceptions\BusinessException(__('salary.immutable'),'salary_immutable',409);
            }
        });
        static::deleting(function ($row) {
            if ($row->is_system || SalaryStructureLine::where('component_id',$row->id)->exists()) {
                throw new \App\Exceptions\BusinessException(__('salary.immutable'),'salary_immutable',409);
            }
        });
    }
}

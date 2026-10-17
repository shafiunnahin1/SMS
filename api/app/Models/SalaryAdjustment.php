<?php
namespace App\Models;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
class SalaryAdjustment extends Model
{
    use BelongsToInstitution,HasFactory;
    public $timestamps=false;
    protected $fillable=['institution_id','payee_type','payee_id','kind','direction','amount','month','taxable','scheme_id','revision_id','description','attachment','status','payroll_item_id','created_by','approved_by'];
    protected $casts=['amount'=>'decimal:2','taxable'=>'boolean','created_at'=>'datetime'];
    protected $hidden=['attachment'];
    protected static function booted(): void
    {
        static::updating(function($row){
            if(in_array($row->getOriginal('status'),['applied','cancelled'],true) || array_diff(array_keys($row->getDirty()),['status','approved_by']))
                throw new \App\Exceptions\BusinessException(__('salary.immutable'),'salary_immutable',409);
        });
        static::deleting(fn()=>throw new \App\Exceptions\BusinessException(__('salary.immutable'),'salary_immutable',409));
    }
}

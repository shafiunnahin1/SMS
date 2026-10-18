<?php

namespace App\Models;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BonusScheme extends Model
{
    use BelongsToInstitution, HasFactory;
    public $timestamps = false;
    protected $fillable = ['institution_id','name','kind','pay_month','basis','value','min_service_months','prorate_below_months','applies_to','max_amount','taxable','status','applied_at','created_by','application_snapshot'];
    protected $casts = ['value'=>'decimal:2','max_amount'=>'decimal:2','applies_to'=>'array','taxable'=>'boolean','applied_at'=>'datetime','application_snapshot'=>'array'];
    protected $hidden=['application_snapshot'];
    protected static function booted(): void
    {
        static::updating(function($row){
            if($row->getOriginal('status')!=='draft' || $row->getOriginal('application_snapshot')!==null)
                throw new \App\Exceptions\BusinessException(__('salary.immutable'),'salary_immutable',409);
        });
        static::deleting(fn()=>throw new \App\Exceptions\BusinessException(__('salary.immutable'),'salary_immutable',409));
    }
}

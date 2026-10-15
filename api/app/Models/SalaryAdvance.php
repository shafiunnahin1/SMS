<?php
namespace App\Models;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
class SalaryAdvance extends Model
{
    use BelongsToInstitution,HasFactory;
    public $timestamps=false;
    protected $fillable=['institution_id','payee_type','payee_id','amount','reason','installments','installment_amount','recover_from_month','terms_snapshot','expense_id','skipped_months','recovered','payment_method','status','requested_by','approved_by','disbursed_at'];
    protected $casts=['amount'=>'decimal:2','installment_amount'=>'decimal:2','recovered'=>'decimal:2','terms_snapshot'=>'array','skipped_months'=>'array','disbursed_at'=>'datetime','created_at'=>'datetime'];
    protected $hidden=['terms_snapshot'];
    protected static function booted(): void
    {
        static::updating(function($row){
            if(in_array($row->getOriginal('status'),['closed','rejected','written_off'],true) || array_diff(array_keys($row->getDirty()),['status','approved_by','expense_id','payment_method','disbursed_at','skipped_months']))
                throw new \App\Exceptions\BusinessException(__('salary.immutable'),'salary_immutable',409);
            if($row->getOriginal('expense_id')!==null && $row->isDirty(['expense_id','payment_method','disbursed_at']))
                throw new \App\Exceptions\BusinessException(__('salary.immutable'),'salary_immutable',409);
            $old=$row->getOriginal('skipped_months')??[];$new=$row->skipped_months??[];
            if(!is_array($new) || array_slice($new,0,count($old))!==$old)
                throw new \App\Exceptions\BusinessException(__('salary.immutable'),'salary_immutable',409);
        });
        static::deleting(fn()=>throw new \App\Exceptions\BusinessException(__('salary.immutable'),'salary_immutable',409));
    }
}

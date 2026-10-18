<?php
namespace App\Models;
use App\Exceptions\BusinessException;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
// R3.8 (staff-payroll.md §10, D32): the PF ledger only grows; a correction is a new `adjustment` row
class ProvidentFundEntry extends Model
{
    use BelongsToInstitution,HasFactory;
    public const UPDATED_AT=null;
    public const KINDS=['employee','employer','withdrawal','interest','adjustment'];
    protected $fillable=['institution_id','payee_type','payee_id','month','kind','amount','payroll_item_id','note','created_by'];
    protected $casts=['amount'=>'decimal:2','created_at'=>'datetime'];
    protected static function booted(): void
    {
        static::updating(fn()=>throw new BusinessException(__('salary.immutable'),'salary_immutable',409));
        static::deleting(fn()=>throw new BusinessException(__('salary.immutable'),'salary_immutable',409));
    }
}

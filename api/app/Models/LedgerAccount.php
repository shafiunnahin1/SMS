<?php
namespace App\Models;
use App\Exceptions\BusinessException;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
// R3.10 (accounting.md §2): chart of accounts; a system account or one with posted lines is never deleted
class LedgerAccount extends Model
{
    use BelongsToInstitution,HasFactory;
    public $timestamps=false;
    protected $fillable=['institution_id','code','name','type','parent_id','is_cash_or_bank','is_system','is_active'];
    protected $casts=['is_cash_or_bank'=>'boolean','is_system'=>'boolean','is_active'=>'boolean'];
    protected static function booted(): void
    {
        static::updating(function($a){
            if($a->isDirty(['code','type']) && VoucherLine::where('account_id',$a->id)->exists()) throw new BusinessException(__('accounting.account_in_use'),'account_in_use',422);
        });
        static::deleting(function($a){
            if($a->is_system || VoucherLine::where('account_id',$a->id)->exists()) throw new BusinessException(__('accounting.account_in_use'),'account_in_use',422);
        });
    }
}

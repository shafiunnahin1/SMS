<?php
namespace App\Models;
use App\Exceptions\BusinessException;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
// R3.10 (accounting.md §1, D36/D32): only a draft may change; a posted or reversing voucher is final and never deleted
class Voucher extends Model
{
    use BelongsToInstitution,HasFactory;
    public const UPDATED_AT=null;
    protected $fillable=['institution_id','voucher_no','type','date','narration','source','source_id','status','reverses_id','created_by','posted_by','posted_at'];
    protected $casts=['date'=>'date','posted_at'=>'datetime','created_at'=>'datetime'];
    public function lines(){return $this->hasMany(VoucherLine::class);}
    protected static function booted(): void
    {
        static::updating(function($v){
            if($v->getOriginal('status')!=='draft') throw new BusinessException(__('accounting.voucher_final'),'voucher_final',422);
        });
        static::deleting(function($v){
            if($v->status!=='draft') throw new BusinessException(__('accounting.voucher_final'),'voucher_final',422);
        });
    }
}

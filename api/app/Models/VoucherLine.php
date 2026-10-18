<?php
namespace App\Models;
use App\Exceptions\BusinessException;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
// R3.10: lines of a posted voucher keep their amounts; only bank-reconciliation fields move (accounting.md §5)
class VoucherLine extends Model
{
    use BelongsToInstitution,HasFactory;
    public $timestamps=false;
    protected $fillable=['institution_id','voucher_id','account_id','debit','credit','memo','reconciled_at','reconciled_ref'];
    protected $casts=['debit'=>'decimal:2','credit'=>'decimal:2','reconciled_at'=>'datetime'];
    public function voucher(){return $this->belongsTo(Voucher::class);}
    public function account(){return $this->belongsTo(LedgerAccount::class,'account_id');}
    protected static function booted(): void
    {
        $final=fn($line)=>Voucher::whereKey($line->voucher_id)->value('status')!=='draft';
        static::updating(function($line)use($final){
            if($final($line) && array_diff(array_keys($line->getDirty()),['reconciled_at','reconciled_ref'])) throw new BusinessException(__('accounting.voucher_final'),'voucher_final',422);
        });
        static::deleting(function($line)use($final){ if($final($line)) throw new BusinessException(__('accounting.voucher_final'),'voucher_final',422); });
    }
}

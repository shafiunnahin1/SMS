<?php
namespace App\Models;
use App\Exceptions\BusinessException;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
// R3.7 (staff-payroll.md §7.3, §8): breakdown and amounts are frozen once the run is approved; afterwards only payment fields move.
class PayrollItem extends Model
{
    use BelongsToInstitution,HasFactory;
    public $timestamps=false;
    public const PAYMENT_FIELDS=['status','hold_reason','payment_method','paid_reference','paid_at','paid_by','slip_no'];
    protected $fillable=['institution_id','run_id','payee_type','payee_id','structure_id','days_in_month','paid_days','absent_days','lwp_days','late_count','basic','gross','total_earnings','total_deductions','tax','net','breakdown','status','hold_reason','payment_method','paid_reference','paid_at','paid_by','slip_no'];
    protected $casts=['breakdown'=>'array','paid_days'=>'decimal:2','absent_days'=>'decimal:2','lwp_days'=>'decimal:2','basic'=>'decimal:2','gross'=>'decimal:2','total_earnings'=>'decimal:2','total_deductions'=>'decimal:2','tax'=>'decimal:2','net'=>'decimal:2','paid_at'=>'datetime'];
    public function run(){return $this->belongsTo(PayrollRun::class,'run_id');}
    protected static function booted(): void
    {
        static::updating(function($item){
            $frozen=in_array(PayrollRun::whereKey($item->run_id)->value('status'),['approved','paid','cancelled'],true);
            if($frozen && array_diff(array_keys($item->getDirty()),self::PAYMENT_FIELDS)) throw new BusinessException(__('salary.immutable'),'salary_immutable',409);
        });
        static::deleting(function($item){
            if(PayrollRun::whereKey($item->run_id)->value('status')!=='draft') throw new BusinessException(__('salary.immutable'),'salary_immutable',409);
        });
    }
}

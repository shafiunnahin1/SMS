<?php
namespace App\Models;
use App\Exceptions\BusinessException;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
// R3.7 (staff-payroll.md §7.1, D104): an approved/paid run is frozen; status moves only through PayrollRunService; never deleted (D32).
class PayrollRun extends Model
{
    use BelongsToInstitution,HasFactory;
    public const UPDATED_AT=null;
    protected $fillable=['institution_id','month','kind','label','status','settings_snapshot','payees_count','total_gross','total_deductions','total_net','prepared_by','reviewed_by','approved_by','approved_at','self_approved','paid_at','cancelled_reason'];
    protected $casts=['settings_snapshot'=>'array','total_gross'=>'decimal:2','total_deductions'=>'decimal:2','total_net'=>'decimal:2','self_approved'=>'boolean','approved_at'=>'datetime','paid_at'=>'datetime','created_at'=>'datetime'];
    public function items(){return $this->hasMany(PayrollItem::class,'run_id');}
    protected static function booted(): void
    {
        static::updating(function($run){
            $from=$run->getOriginal('status');
            // frozen once approved: only the paid stamp / cancellation of an unpaid approved run may change
            if(in_array($from,['paid','cancelled'],true) || ($from==='approved' && array_diff(array_keys($run->getDirty()),['status','paid_at','cancelled_reason'])))
                throw new BusinessException(__('salary.immutable'),'salary_immutable',409);
        });
        static::deleting(fn()=>throw new BusinessException(__('salary.immutable'),'salary_immutable',409));
    }
}

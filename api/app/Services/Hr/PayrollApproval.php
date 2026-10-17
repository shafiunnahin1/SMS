<?php
namespace App\Services\Hr;
use App\Models\{AuditLog,User};
use App\Support\Tenancy;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\Validator;
/** D87 service approval policy, including explicit and audited configured exceptions. */
class PayrollApproval
{
    public function __construct(private SalaryAccess $access) {}
    public function policy(): array
    {
        $all=data_get(Tenancy::current()->settings??[],'payroll',[]);
        if(!is_array($all)) throw \Illuminate\Validation\ValidationException::withMessages(['payroll'=>__('salary.invalid')]);
        $defaults=['allow_self_approval'=>'if_sole_approver','max_active_advances'=>1,'max_advance_months'=>3,'min_net_after_recovery'=>'0.00','max_fine_percent'=>null,'adjustment_approval_threshold'=>null];
        $p=array_replace($defaults,array_intersect_key($all,$defaults));
        Validator::make($p,['allow_self_approval'=>'required|in:never,if_sole_approver,always','max_active_advances'=>'required|integer|min:1','max_advance_months'=>'required|integer|min:1'])->validate();
        foreach(['max_active_advances','max_advance_months'] as $k) if(!is_int($p[$k])) throw \Illuminate\Validation\ValidationException::withMessages([$k=>__('salary.invalid')]);
        foreach(['min_net_after_recovery','max_fine_percent','adjustment_approval_threshold'] as $k) if($p[$k]!==null) app(SalaryCalculator::class)->paisa($p[$k],$k);
        return $p;
    }
    public function authorize(User $actor,?int $prepared,array $policy): bool
    {
        $actor=$this->access->actor($actor);if($actor->role!=='admin') throw new AuthorizationException();
        $self=$prepared===$actor->id;
        if($self){
            $mode=$policy['allow_self_approval'];$admins=User::where('institution_id',Tenancy::current()->id)->where('role','admin')->where('is_active',true)->count();
            if($mode==='never' || ($mode==='if_sole_approver' && $admins!==1)) throw new AuthorizationException();
        }
        return $self;
    }
    public function audit(User $actor,\Illuminate\Database\Eloquent\Model $row,string $event,array $data=[]): void
    {
        AuditLog::create(['institution_id'=>Tenancy::current()->id,'user_id'=>$actor->id,'action'=>'salary.'.$event,'model'=>class_basename($row),'model_id'=>$row->id,'new_data'=>$data]);
    }
    public function lock(User $actor): void
    {
        $this->access->actor($actor);Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();$this->access->actor($actor);
    }
}

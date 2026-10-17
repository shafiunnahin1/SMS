<?php

namespace App\Services\Hr;

use App\Exceptions\BusinessException;
use App\Models\{StaffMember,Teacher,User};
use App\Services\ModuleGate;
use App\Support\Tenancy;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Validation\ValidationException;

class SalaryAccess
{
    public function actor(User $actor, bool $allowTeacher = false): User
    {
        // Exact ability membership: tokenCan('impersonated') would also match ordinary '*' tokens.
        if($actor->role==='super_admin' || in_array('impersonated',$actor->currentAccessToken()?->abilities??[],true)) {
            throw new BusinessException(__('salary.sensitive'),'sensitive_scope',403);
        }
        $institution=Tenancy::current();
        if(!$institution) throw new AuthorizationException();
        $fresh=User::where('institution_id',$institution->id)->whereKey($actor->id)->where('is_active',true)->first();
        // D101: department staff reach here only through StaffIdentityBoundary (allowlisted route + exact duty key + context)
        if(!$fresh || !in_array($fresh->role,$allowTeacher?['admin','accountant','teacher','institution_staff']:['admin','accountant','institution_staff'],true)) throw new AuthorizationException();
        if(!app(ModuleGate::class)->allows($institution,'hr_payroll')) throw new BusinessException(__('errors.module_disabled'),'module_disabled',403);
        return $fresh;
    }

    public function payee(User $actor, string $type, int $id, bool $allowTeacher = false): Teacher|StaffMember
    {
        $actor=$this->actor($actor,$allowTeacher);
        if($actor->role==='teacher' && ($type!=='teacher' || (int)Teacher::where('user_id',$actor->id)->value('id')!==$id)) throw new AuthorizationException();
        if(!in_array($type,['teacher','staff'],true)) throw ValidationException::withMessages(['type'=>__('salary.invalid')]);
        return $type==='teacher'?Teacher::findOrFail($id):StaffMember::findOrFail($id);
    }
}

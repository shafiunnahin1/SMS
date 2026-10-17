<?php
namespace App\Services\Hr;

use App\Models\{AuditLog, LeaveApplication, StaffAttendance, StaffMember, Teacher, TeacherAttendance};
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StaffAttendanceService
{
    public function save(string $type, array $data): int
    {
        return DB::transaction(function () use ($type,$data) {
            Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            $parent=$type==='teacher'?Teacher::class:StaffMember::class;
            $model=$type==='teacher'?TeacherAttendance::class:StaffAttendance::class;
            foreach($data['records'] as $input) {
                if (empty($input[$type.'_id']) || isset($input[($type==='teacher'?'staff':'teacher').'_id'])) throw ValidationException::withMessages(['records'=>__('hr.invalid')]);
                $payee=$parent::findOrFail($input[$type.'_id']);
                $date=$data['date'];
                if ($payee->status==='inactive' || ($payee->joining_date && $date<$payee->joining_date->toDateString()) ||
                    ($payee->leaving_date && $date>$payee->leaving_date->toDateString())) throw ValidationException::withMessages(['date'=>__('hr.invalid')]);
                if ($input['status']==='leave') {
                    $allowed=false;
                    foreach(LeaveApplication::where('status','approved')->where($type==='teacher'?'user_id':'staff_id',$type==='teacher'?$payee->user_id:$payee->id)
                        ->where('from_date','<=',$date)->where('to_date','>=',$date)->get() as $leave) {
                        if(in_array($date,app(LeaveService::class)->snapshot($leave)['dates'],true)) $allowed=true;
                    }
                    if(!$allowed) throw ValidationException::withMessages(['records'=>__('hr.invalid')]);
                }
                $key=[$type.'_id'=>$payee->id,'date'=>$date];
                $row=$model::firstOrNew($key);
                $row->fill(array_intersect_key($input,array_flip(['status','check_in','check_out','note']))+['marked_by'=>auth()->id()])->save();
                AuditLog::record('attendance.marked',$row);
            }
            return count($data['records']);
        });
    }
}

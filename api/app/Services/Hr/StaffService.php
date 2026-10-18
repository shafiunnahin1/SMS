<?php
namespace App\Services\Hr;

use App\Models\{AuditLog, StaffMember, User};
use App\Support\Tenancy;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class StaffService
{
    public function save(array $data, ?int $id = null): StaffMember
    {
        return DB::transaction(function () use ($data,$id) {
            Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            $row = $id ? StaffMember::findOrFail($id) : new StaffMember();
            if (isset($data['user_id'])) User::where('institution_id',Tenancy::current()->id)->whereKey($data['user_id'])->where('role','accountant')->firstOrFail();
            $joining = array_key_exists('joining_date',$data) ? $data['joining_date'] : $row->joining_date?->toDateString();
            $leaving = array_key_exists('leaving_date',$data) ? $data['leaving_date'] : $row->leaving_date?->toDateString();
            if ($joining && $leaving && $leaving < $joining) throw ValidationException::withMessages(['leaving_date'=>__('hr.invalid')]);
            $photo = $data['photo'] ?? null; unset($data['photo']);
            $row->fill($data)->save();
            if ($photo instanceof UploadedFile) {
                $path = 'institutions/'.Tenancy::current()->id.'/staff/'.$row->id;
                $row->photo = $photo->storeAs($path,'photo-'.Str::uuid().'.'.$photo->extension(),'private');
                $row->save();
            }
            AuditLog::record($id?'staff.updated':'staff.created',$row);
            return $row;
        });
    }
    public function delete(int $id): void
    {
        DB::transaction(function () use ($id) {
            Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            $row=StaffMember::findOrFail($id); $row->delete(); AuditLog::record('staff.deleted',$row);
        });
    }
}

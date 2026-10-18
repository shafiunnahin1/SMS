<?php
namespace App\Http\Controllers\Hr;
use App\Http\Controllers\Controller;
use App\Http\Requests\Hr\LeaveTypeRequest;
use App\Http\Resources\LeaveTypeResource;
use App\Models\{AuditLog,LeaveType};

class LeaveTypeController extends Controller
{
    public function index() { return LeaveTypeResource::collection(LeaveType::orderBy('id')->get())->additional(['success'=>true]); }
    public function store(LeaveTypeRequest $request)
    {
        return \Illuminate\Support\Facades\DB::transaction(function() use($request) {
            $row=LeaveType::create($request->validated()); AuditLog::record('leave_type.created',$row);
            return (new LeaveTypeResource($row))->additional(['success'=>true])->response()->setStatusCode(201);
        });
    }
    public function update(LeaveTypeRequest $request,int $id)
    {
        return \Illuminate\Support\Facades\DB::transaction(function() use($request,$id) {
            \App\Support\Tenancy::current()->newQuery()->whereKey(\App\Support\Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            $row=LeaveType::findOrFail($id); $row->fill($request->validated())->save(); AuditLog::record('leave_type.updated',$row);
            return (new LeaveTypeResource($row))->additional(['success'=>true]);
        });
    }
}

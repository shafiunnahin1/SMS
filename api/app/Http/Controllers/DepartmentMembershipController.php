<?php
namespace App\Http\Controllers;

use App\Http\Requests\DepartmentMembershipRequest;
use App\Http\Resources\DepartmentMembershipResource;
use App\Services\DepartmentService;

class DepartmentMembershipController extends Controller
{
    public function __construct(private DepartmentService $departments) {}
    public function store(DepartmentMembershipRequest $request, int $department)
    {
        return response()->json(['success' => true, 'data' => new DepartmentMembershipResource($this->departments->addMember($request->user(), $department, $request->validated()))], 201);
    }
    public function update(DepartmentMembershipRequest $request, int $id)
    {
        return response()->json(['success' => true, 'data' => new DepartmentMembershipResource($this->departments->updateMember($request->user(), $id, $request->validated()))]);
    }
    public function assignDuties(DepartmentMembershipRequest $request, int $id)
    {
        return response()->json(['success' => true, 'data' => new DepartmentMembershipResource($this->departments->assignDuties($request->user(), $id, $request->validated()))]);
    }
}

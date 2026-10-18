<?php
namespace App\Http\Controllers;

use App\Http\Requests\DepartmentDutyRequest;
use App\Http\Resources\DepartmentDutyResource;
use App\Services\DepartmentService;
use Illuminate\Http\Request;

class DepartmentDutyController extends Controller
{
    public function __construct(private DepartmentService $departments) {}
    public function index(Request $request, int $department)
    {
        $input = $request->validate(['per_page' => 'sometimes|integer|min:1|max:100']);
        return DepartmentDutyResource::collection($this->departments->duties($request->user(), $department, $input['per_page'] ?? 25))->additional(['success' => true]);
    }
    public function store(DepartmentDutyRequest $request, int $department)
    {
        return response()->json(['success' => true, 'data' => new DepartmentDutyResource($this->departments->createDuty($request->user(), $department, $request->validated()))], 201);
    }
    public function update(DepartmentDutyRequest $request, int $department, int $duty)
    {
        return response()->json(['success' => true, 'data' => new DepartmentDutyResource($this->departments->updateDuty($request->user(), $department, $duty, $request->validated()))]);
    }
}

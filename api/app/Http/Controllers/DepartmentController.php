<?php

namespace App\Http\Controllers;

use App\Http\Requests\DepartmentRequest;
use App\Http\Resources\DepartmentResource;
use App\Services\DepartmentService;
use Illuminate\Http\Request;

class DepartmentController extends Controller
{
    public function __construct(private DepartmentService $departments) {}
    public function index(Request $request)
    {
        $input = $request->validate(['per_page' => 'sometimes|integer|min:1|max:100']);
        return DepartmentResource::collection($this->departments->index($request->user(), $input['per_page'] ?? 25))->additional(['success' => true]);
    }
    public function store(DepartmentRequest $request)
    {
        return response()->json(['success' => true, 'data' => new DepartmentResource($this->departments->create($request->user(), $request->validated()))], 201);
    }
    public function update(DepartmentRequest $request, int $id)
    {
        return response()->json(['success' => true, 'data' => new DepartmentResource($this->departments->update($request->user(), $id, $request->validated()))]);
    }
    public function archive(DepartmentRequest $request, int $id)
    {
        return response()->json(['success' => true, 'data' => new DepartmentResource($this->departments->archive($request->user(), $id))]);
    }
}

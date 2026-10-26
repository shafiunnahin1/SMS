<?php

namespace App\Http\Controllers;

use App\Http\Requests\DepartmentContextRequest;
use App\Http\Resources\DepartmentContextResource;
use App\Services\DepartmentContextService;

class DepartmentContextController extends Controller
{
    public function __construct(private DepartmentContextService $contexts, private \App\Services\DepartmentDutyPermissionService $duties) {}

    public function index(DepartmentContextRequest $request)
    {
        $input = $request->validated();
        return DepartmentContextResource::collection($this->contexts->paginate($request->user(), $input['per_page'] ?? 25, $input['page'] ?? 1))
            ->additional(['success' => true]);
    }

    public function show(DepartmentContextRequest $request, int $id)
    {
        // D169 STW.1: the keys held in this department, so the staff menu shows only the work it allows (every request is checked again)
        $context = $this->contexts->show($request->user(), $id);
        return (new DepartmentContextResource($context))->additional(['success' => true, 'permissions' => $this->duties->keys($request->user(), $id)]);
    }
}

<?php

namespace App\Http\Controllers;

use App\Http\Requests\DepartmentContextRequest;
use App\Http\Resources\DepartmentContextResource;
use App\Services\DepartmentContextService;

class DepartmentContextController extends Controller
{
    public function __construct(private DepartmentContextService $contexts) {}

    public function index(DepartmentContextRequest $request)
    {
        $input = $request->validated();
        return DepartmentContextResource::collection($this->contexts->paginate($request->user(), $input['per_page'] ?? 25, $input['page'] ?? 1))
            ->additional(['success' => true]);
    }

    public function show(DepartmentContextRequest $request, int $id)
    {
        return (new DepartmentContextResource($this->contexts->show($request->user(), $id)))->additional(['success' => true]);
    }
}

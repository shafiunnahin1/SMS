<?php

namespace App\Http\Controllers\Academic;

use App\Http\Controllers\Controller;
use App\Http\Requests\Academic\TeacherRequest;
use App\Http\Resources\{StaffTeacherResource, TeacherResource};
use App\Models\Teacher;
use App\Services\{DepartmentAcademicReadService, DepartmentRequestContextService, TeacherService};
use Illuminate\Http\Request;

// Step 4.1 (owner of the `teachers` table): admin manages the institution's teachers
class TeacherController extends Controller
{
    public function __construct(
        private TeacherService $teachers,
        private DepartmentRequestContextService $contexts,
        private DepartmentAcademicReadService $staffAcademic,
    ) {}

    public function index(Request $request)
    {
        if ($request->user()?->role === 'institution_staff') {
            $departmentId = $this->contexts->forRoute($request);
            $filters = $request->validate(['q' => 'nullable|string|max:50', 'status' => 'nullable|in:active,inactive,on_leave']);
            return StaffTeacherResource::collection($this->staffAcademic->ownTeachers($request->user(), $departmentId, $filters))
                ->additional(['success' => true]);
        }

        $request->validate(['q' => 'nullable|string|max:50', 'status' => 'nullable|in:active,inactive,on_leave']);
        $rows = Teacher::with('user:id,name,phone,email')
            ->when($request->input('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->input('q'), fn ($q, $s) => $q->where(fn ($w) => $w->where('employee_id', 'like', "{$s}%")
                ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$s}%")->orWhere('phone', 'like', "%{$s}%"))))
            ->orderBy('employee_id')->get();
        return TeacherResource::collection($rows)->additional(['success' => true]);
    }

    public function store(TeacherRequest $request)
    {
        return (new TeacherResource($this->teachers->create($request->validated())))
            ->additional(['success' => true, 'message' => __('messages.saved')])->response()->setStatusCode(201);
    }

    public function show(int $id)
    {
        return (new TeacherResource(Teacher::with('user:id,name,phone,email')->findOrFail($id)))->additional(['success' => true]);
    }

    public function update(TeacherRequest $request, int $id)
    {
        return (new TeacherResource($this->teachers->update(Teacher::findOrFail($id), $request->validated())))
            ->additional(['success' => true, 'message' => __('messages.saved')]);
    }

    public function destroy(int $id)
    {
        $this->teachers->delete(Teacher::findOrFail($id));
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }
}

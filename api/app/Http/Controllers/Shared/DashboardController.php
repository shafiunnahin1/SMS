<?php

namespace App\Http\Controllers\Shared;

use App\Http\Controllers\Controller;
use App\Models\Student;
use Illuminate\Http\Request;

// Step 4.7 routes; the walking-skeleton slice (Spike S6) builds GET /parent/children (the child switcher). The dashboards follow in 4.7.
class DashboardController extends Controller
{
    public function parentChildren(Request $request)
    {
        $children = Student::whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))
            ->with(['user:id,name', 'program:id,name', 'batch:id,name'])->orderBy('id')->get()
            ->map(fn ($s) => ['id' => $s->id, 'student_id' => $s->student_id, 'name' => $s->user?->name,
                'program' => $s->program?->name, 'batch' => $s->batch?->name, 'roll_no' => $s->roll_no]);

        return response()->json(['success' => true, 'data' => $children]);
    }
}

<?php

namespace App\Http\Controllers\Learner;

use App\Http\Controllers\Controller;
use App\Services\Learner\StudentMoveService;
use App\Support\Tenancy;
use Illuminate\Http\Request;

// D165 ST.5: an institution's student moves their valid purchases to their own learners account (own mobile, code) - not on the learners host
class StudentMoveController extends Controller
{
    public function __construct(private StudentMoveService $moves) {}

    public function start(Request $request)
    {
        abort_if(Tenancy::current()?->institution_type === 'learners', 404);
        $f = $request->validate(['phone' => ['required', 'string', 'regex:/^(\+?88)?01[3-9]\d{8}$/'], 'password' => 'nullable|string|min:8|max:100|confirmed', 'accept_terms' => 'accepted']);
        return response()->json(['success' => true, 'data' => $this->moves->start($request->user(), $f['phone'], $f['password'] ?? null)]);
    }

    public function verify(Request $request)
    {
        abort_if(Tenancy::current()?->institution_type === 'learners', 404);
        $code = $request->validate(['code' => 'required|string|max:10'])['code'];
        return response()->json(['success' => true, 'data' => $this->moves->verify($request->user(), $code)]);
    }
}

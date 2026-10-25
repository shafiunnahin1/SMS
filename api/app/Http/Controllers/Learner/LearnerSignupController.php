<?php

namespace App\Http\Controllers\Learner;

use App\Http\Controllers\Controller;
use App\Http\Requests\Learner\LearnerSignupRequest;
use App\Models\QbClassLevel;
use App\Services\Learner\LearnerRegistrationService;
use Illuminate\Http\Request;

// D165 (1) ST.1: the central host's public student registration - the classes to choose from, register, verify the code, resend it
class LearnerSignupController extends Controller
{
    public function __construct(private LearnerRegistrationService $service) {}

    public function classLevels()
    {
        return response()->json(['success' => true, 'data' => QbClassLevel::where('is_active', true)->orderBy('sort_order')->get(['id', 'name_bn', 'name_en', 'education_level'])]);
    }

    public function store(LearnerSignupRequest $request)
    {
        return response()->json(['success' => true, 'data' => $this->service->register($request->validated())], 201);
    }

    public function verify(Request $request, int $id)
    {
        $code = $request->validate(['code' => 'required|string|max:10'])['code'];
        return response()->json(['success' => true, 'data' => $this->service->verify($id, $code)]);
    }

    public function resend(int $id)
    {
        $this->service->resend($id);
        return response()->json(['success' => true, 'message' => __('messages.activation_resent')], 202);
    }
}

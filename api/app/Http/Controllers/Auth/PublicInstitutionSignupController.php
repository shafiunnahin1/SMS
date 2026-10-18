<?php
namespace App\Http\Controllers\Auth;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\{SignupInstitutionRequest, PrincipalActivationRequest, PrincipalResendRequest};
use App\Http\Resources\PrincipalActivationResource;
use App\Services\Auth\{ActivationDelivery, PrincipalProvisioningService};

class PublicInstitutionSignupController extends Controller
{
    public function __construct(private PrincipalProvisioningService $provisioning) {}
    public function store(SignupInstitutionRequest $request, ActivationDelivery $delivery)
    {
        if (!config('auth_policy.activation.public_signup_enabled') || !$delivery->available()) throw new BusinessException(__('errors.activation_unavailable'), 'activation_unavailable', 503);
        $in = $request->validated();
        $state = $this->provisioning->provision(collect($in)->except('principal')->all(), $in['principal']);
        return response()->json(['success' => true, 'data' => new PrincipalActivationResource($state)], 201);
    }
    public function verify(PrincipalActivationRequest $request, int $id)
    {
        $password = $request->has('password') ? $request->only(['password', 'password_confirmation']) : null;
        return response()->json(['success' => true, 'data' => new PrincipalActivationResource(
            $this->provisioning->verify($id, $request->input('public_id'), $request->input('code'), $password))]);
    }
    public function resend(PrincipalResendRequest $request, int $id)
    {
        $this->provisioning->resend($id, $request->input('public_id'), $request->input('contact'));
        return response()->json(['success' => true, 'message' => __('messages.activation_resent')], 202);
    }
}

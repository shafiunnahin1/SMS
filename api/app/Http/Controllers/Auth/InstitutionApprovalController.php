<?php
namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\RegistrationReviewRequest;
use App\Http\Resources\PrincipalActivationResource;
use App\Services\Auth\PrincipalProvisioningService;

class InstitutionApprovalController extends Controller
{
    public function __construct(private PrincipalProvisioningService $provisioning) {}
    public function approve(RegistrationReviewRequest $request, int $id)
    {
        return response()->json(['success' => true, 'data' => new PrincipalActivationResource(
            $this->provisioning->review($id, $request->user(), $request->input('decision'), $request->input('reason')))]);
    }
}

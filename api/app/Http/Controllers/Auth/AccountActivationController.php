<?php
namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\StaffActivationRequest;
use App\Http\Resources\PrincipalActivationResource;
use App\Services\Auth\StaffAccountService;

class AccountActivationController extends Controller
{
    public function store(StaffActivationRequest $request, StaffAccountService $accounts)
    {
        return response()->json(['success' => true, 'data' => new PrincipalActivationResource(
            $accounts->activate($request->input('public_id'), $request->input('code'), $request->only(['password', 'password_confirmation'])))]);
    }
}

<?php
namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\{StaffAccountRequest, StaffProfileRequest, StaffReissueRequest};
use App\Http\Resources\{StaffAccountResource, PrincipalActivationResource};
use App\Services\Auth\StaffAccountService;
use Illuminate\Http\Request;

class StaffAccountController extends Controller
{
    public function __construct(private StaffAccountService $accounts) {}
    public function index(Request $request)
    {
        $in = $request->validate(['per_page' => 'sometimes|integer|min:1|max:100']);
        return StaffAccountResource::collection($this->accounts->index($request->user(), $in['per_page'] ?? 25))->additional(['success' => true]);
    }
    public function store(StaffAccountRequest $request)
    {
        return $this->response($this->accounts->create($request->user(), $request->validated()), 201);
    }
    public function update(StaffAccountRequest $request, int $id)
    {
        return $this->response($this->accounts->update($request->user(), $id, $request->validated()));
    }
    public function resendActivation(StaffReissueRequest $request, int $id)
    {
        $this->accounts->reissue($request->user(), $id);
        return response()->json(['success' => true, 'message' => __('messages.activation_resent')], 202);
    }
    public function updateOwnProfile(StaffProfileRequest $request)
    {
        return response()->json(['success' => true, 'data' => new StaffAccountResource($this->accounts->updateOwnProfile($request->user(), $request->validated()))]);
    }
    private function response(array $result, int $status = 200)
    {
        return response()->json(['success' => true, 'data' => new StaffAccountResource($result['user']),
            'activation' => $result['activation'] ? new PrincipalActivationResource($result['activation']) : null], $status);
    }
}

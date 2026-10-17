<?php
namespace App\Http\Controllers\Hr;
use App\Http\Controllers\Controller;
use App\Http\Requests\Hr\{HrQueryRequest,StaffRequest};
use App\Http\Resources\StaffResource;
use App\Models\StaffMember;
use App\Services\Hr\StaffService;

class StaffController extends Controller
{
    public function index(HrQueryRequest $request)
    {
        $data=$request->validated();
        return StaffResource::collection(StaffMember::when($data['status']??null,fn($q,$s)=>$q->where('status',$s))
            ->when($data['q']??null,fn($q,$s)=>$q->where('name','like',$s.'%'))->orderBy('id')->paginate($data['per_page']??25))->additional(['success'=>true]);
    }
    public function store(StaffRequest $request,StaffService $service) { return (new StaffResource($service->save($request->validated())))->additional(['success'=>true])->response()->setStatusCode(201); }
    public function show(int $id) { return (new StaffResource(StaffMember::findOrFail($id)))->additional(['success'=>true]); }
    public function update(StaffRequest $request,int $id,StaffService $service) { return (new StaffResource($service->save($request->validated(),$id)))->additional(['success'=>true]); }
    public function destroy(int $id,StaffService $service) { $service->delete($id); return response()->json(['success'=>true]); }
}

<?php
namespace App\Http\Controllers\Hr;
use App\Http\Controllers\Controller;
use App\Http\Requests\Hr\{HrQueryRequest,LeaveRequest};
use App\Http\Resources\LeaveResource;
use App\Models\{LeaveApplication,LeaveType};
use App\Services\Hr\LeaveService;

class LeaveController extends Controller
{
    public function index(HrQueryRequest $request)
    {
        $data=$request->validated(); $query=LeaveApplication::query();
        foreach(['status','leave_type_id'] as $field) if(isset($data[$field])) $query->where($field,$data[$field]);
        if(isset($data['type'],$data['id'])) $query->where($data['type']==='teacher'?'user_id':'staff_id',$data['id']);
        if(isset($data['month'])) {
            $start=\Carbon\CarbonImmutable::createFromFormat('!Y-m',$data['month']);
            $query->where('from_date','<=',$start->endOfMonth()->toDateString())->where('to_date','>=',$start->toDateString());
        }
        return LeaveResource::collection($query->orderByDesc('id')->paginate($data['per_page']??25))->additional(['success'=>true]);
    }
    public function mine(HrQueryRequest $request)
    {
        return LeaveResource::collection(LeaveApplication::where('user_id',$request->user()->id)->orderByDesc('id')->paginate($request->integer('per_page',25)))->additional(['success'=>true]);
    }
    public function store(LeaveRequest $request,LeaveService $service)
    {
        return (new LeaveResource($service->create($request->validated(),$request->user())))->additional(['success'=>true])->response()->setStatusCode(201);
    }
    public function apply(LeaveRequest $request,LeaveService $service)
    {
        $data=$request->validated();
        if(isset($data['staff_id']) || (isset($data['user_id']) && (int)$data['user_id']!==$request->user()->id)) abort(403);
        $data['user_id']=$request->user()->id;
        return (new LeaveResource($service->create($data,$request->user())))->additional(['success'=>true])->response()->setStatusCode(201);
    }
    public function transition(LeaveRequest $request,int $id,string $action,LeaveService $service)
    {
        return (new LeaveResource($service->transition($id,$action,$request->validated(),$request->user())))->additional(['success'=>true]);
    }
    public function balance(HrQueryRequest $request,LeaveService $service)
    {
        $data=$request->validated();
        if(!isset($data['type'],$data['id'])) abort(422);
        $teacher=$data['type']==='teacher';
        $service->payee($teacher?(int)$data['id']:null,$teacher?null:(int)$data['id']);
        $year=(int)($data['year']??now()->year);
        return response()->json(['success'=>true,'data'=>LeaveType::orderBy('id')->get()->map(function($type) use($service,$data,$teacher,$year) {
            $used=$service->consumed($teacher?(int)$data['id']:null,$teacher?null:(int)$data['id'],$type->id,$year);
            return ['leave_type_id'=>$type->id,'year'=>$year,'allowed'=>$type->max_days_per_year,'used'=>$used,'remaining'=>max(0,$type->max_days_per_year-$used)];
        })]);
    }
}

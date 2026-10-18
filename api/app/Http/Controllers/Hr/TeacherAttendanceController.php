<?php
namespace App\Http\Controllers\Hr;
use App\Http\Controllers\Controller;
use App\Http\Requests\Hr\{HrQueryRequest,StaffAttendanceRequest};
use App\Http\Resources\StaffAttendanceResource;
use App\Models\TeacherAttendance;
use App\Services\Hr\{AttendanceSummary,StaffAttendanceService};

class TeacherAttendanceController extends Controller
{
    public function index(HrQueryRequest $request,AttendanceSummary $summary)
    {
        $data=$request->validated();
        if(isset($data['id'],$data['month'])) return response()->json(['success'=>true,'data'=>$summary->forPayee('teacher',(int)$data['id'],$data['month'])]);
        $query=TeacherAttendance::query();
        if(isset($data['date'])) $query->where('date',$data['date']);
        if(isset($data['id'])) $query->where('teacher_id',$data['id']);
        if(isset($data['month'])) {
            $start=\Carbon\CarbonImmutable::createFromFormat('!Y-m',$data['month']);
            $query->whereBetween('date',[$start->toDateString(),$start->endOfMonth()->toDateString()]);
        }
        return StaffAttendanceResource::collection($query->orderByDesc('date')->orderBy('id')->paginate($data['per_page']??25))->additional(['success'=>true]);
    }
    public function store(StaffAttendanceRequest $request,StaffAttendanceService $service)
    {
        return response()->json(['success'=>true,'data'=>['saved'=>$service->save('teacher',$request->validated())]]);
    }
}

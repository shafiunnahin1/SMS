<?php

namespace App\Http\Controllers\Routines;

use App\Http\Controllers\Controller;
use App\Models\{Institution, Routine, RoutineBlock};
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

// D197 AAD.5 (academics-advanced.md section 4.2): GET|POST|PUT|DELETE /routine-blocks. Every writer takes the tenant institution
// row lock first (routine.md D96 rule). Saving a block never moves or deletes classes; it lists the classes already inside it so
// the admin can move them (the routine save refuses new ones: conflict `block`).
class RoutineBlockController extends Controller
{
    /** GET /routine-blocks?program_id= (admin, teacher, student) */
    public function index(Request $request)
    {
        $p = $request->validate(['program_id' => 'nullable|integer'])['program_id'] ?? null;
        $rows = RoutineBlock::with('program:id,name')->when($p, fn ($q) => $q->for((int) $p))->orderBy('sort_order')->orderBy('start_time')->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($b) => $this->row($b))->values()]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $b = DB::transaction(function () use ($data) {
            Institution::whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            return RoutineBlock::create($data);
        });
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($b->load('program:id,name')) + ['overlapping_routines' => $this->overlaps($b)]], 201);
    }

    public function update(Request $request, int $id)
    {
        RoutineBlock::findOrFail($id);
        $data = $this->validated($request);
        $b = DB::transaction(function () use ($data, $id) {
            Institution::whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            $b = RoutineBlock::whereKey($id)->lockForUpdate()->firstOrFail();
            $b->update($data);
            return $b->fresh('program:id,name');
        });
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($b) + ['overlapping_routines' => $this->overlaps($b)]]);
    }

    public function destroy(int $id)
    {
        RoutineBlock::findOrFail($id);
        DB::transaction(function () use ($id) {
            Institution::whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            RoutineBlock::whereKey($id)->lockForUpdate()->firstOrFail()->delete();
        });
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    private function validated(Request $request): array
    {
        $t = Tenancy::current()->id;
        $d = $request->validate([
            'program_id' => ['nullable', 'integer', Rule::exists('programs', 'id')->where('institution_id', $t)],
            'day_of_week' => ['nullable', Rule::in(Routine::DAYS)],
            'start_time' => 'required|date_format:H:i',
            'end_time' => 'required|date_format:H:i|after:start_time',
            'kind' => ['required', Rule::in(RoutineBlock::KINDS)],
            'label' => 'nullable|string|max:80',
            'sort_order' => 'nullable|integer|min:0|max:999',
        ]);
        return $d + ['program_id' => null, 'day_of_week' => null, 'label' => null, 'sort_order' => 0];
    }

    /** the classes already routined inside the block */
    private function overlaps(RoutineBlock $b): array
    {
        return Routine::with(['subject:id,name', 'batch:id,name'])->when($b->program_id, fn ($q) => $q->where('program_id', $b->program_id))
            ->when($b->day_of_week, fn ($q) => $q->where('day_of_week', $b->day_of_week))
            ->where('start_time', '<', $b->end_time)->where('end_time', '>', $b->start_time)->orderBy('day_of_week')->orderBy('start_time')->get()
            ->map(fn ($r) => ['routine_id' => $r->id, 'day_of_week' => $r->day_of_week, 'start_time' => substr((string) $r->start_time, 0, 5), 'subject' => $r->subject?->name, 'batch' => $r->batch?->name])->values()->all();
    }

    private function row(RoutineBlock $b): array
    {
        return ['id' => $b->id, 'program_id' => $b->program_id, 'program' => $b->program?->name, 'day_of_week' => $b->day_of_week,
            'start_time' => substr((string) $b->start_time, 0, 5), 'end_time' => substr((string) $b->end_time, 0, 5), 'kind' => $b->kind, 'label' => $b->label, 'sort_order' => $b->sort_order];
    }
}

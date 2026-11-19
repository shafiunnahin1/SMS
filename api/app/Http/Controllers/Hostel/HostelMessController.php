<?php

namespace App\Http\Controllers\Hostel;

use App\Http\Controllers\Controller;
use App\Models\{Hostel, HostelAllocation, HostelMessBazar, HostelMessBill, HostelMessMonth, Student};
use App\Services\Hostel\MessService;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// D233 HST.3: a hostel's mess - settings, the daily meal-off sheet, the bazar book, closing a month into bills, adjustments, a
// member's with/without mess, and the student's / parent's own meals and bills. Read: staff.hostel.read; changes: staff.hostel.manage.
class HostelMessController extends Controller
{
    public function __construct(private MessService $mess) {}

    /** GET /hostel/{id}/mess?month= */
    public function show(Request $request, int $id)
    {
        $h = Hostel::findOrFail($id);
        $f = $request->validate(['month' => 'nullable|date_format:Y-m']);
        $month = $f['month'] ?? now()->format('Y-m');
        $closed = HostelMessMonth::where('hostel_id', $h->id)->where('month', $month)->first();
        $counts = $this->mess->mealCounts($h, $month, $month === now()->format('Y-m') ? now() : null);
        $w = array_sum(array_map(fn ($c) => $this->mess->weighted100($h, $c), $counts));
        $bazar = $this->mess->bazarPaisa($h, $month);
        return response()->json(['success' => true, 'data' => ['settings' => self::settings($h), 'month' => $month, 'members' => count($counts),
            'meals' => ['breakfast' => array_sum(array_column($counts, 'breakfast')), 'lunch' => array_sum(array_column($counts, 'lunch')), 'dinner' => array_sum(array_column($counts, 'dinner')), 'weighted' => Money::format($w)],
            'bazar' => Money::format($bazar), 'rate_so_far' => $h->mess_mode === 'meal_rate' && $w > 0 ? number_format($bazar / $w, 2, '.', '') : null,
            'closed' => $closed ? ['at' => $closed->closed_at->toDateTimeString(), 'by_job' => $closed->closed_by === null, 'meal_rate' => $closed->meal_rate !== null ? (string) $closed->meal_rate : null] : null,
            'can_close' => !$closed && $month < now()->format('Y-m') && $h->mess_mode !== 'none']]);
    }

    /** PUT /hostel/{id}/mess */
    public function update(Request $request, int $id)
    {
        $h = Hostel::findOrFail($id);
        $money = ['nullable', 'regex:/^\d{1,6}(\.\d{1,2})?$/'];
        $f = $request->validate(['mess_mode' => 'sometimes|in:none,fixed_monthly,per_meal,meal_rate', 'mess_monthly_fee' => $money, 'breakfast_rate' => $money, 'lunch_rate' => $money, 'dinner_rate' => $money,
            'breakfast_weight' => 'sometimes|numeric|min:0|max:5', 'lunch_weight' => 'sometimes|numeric|min:0|max:5', 'dinner_weight' => 'sometimes|numeric|min:0|max:5']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::settings($this->mess->saveSettings($h, $f))]);
    }

    /** GET /hostel/{id}/meals?date= */
    public function meals(Request $request, int $id)
    {
        $h = Hostel::findOrFail($id);
        $f = $request->validate(['date' => 'nullable|date_format:Y-m-d']);
        $date = $f['date'] ?? now()->toDateString();
        return response()->json(['success' => true, 'data' => ['date' => $date, 'closed' => $this->mess->isClosed($h, substr($date, 0, 7)), 'members' => $this->mess->day($h, $date)]]);
    }

    /** PUT /hostel/{id}/meals {date, offs: [{student_id, meals: [...]}]} */
    public function markMeals(Request $request, int $id)
    {
        $h = Hostel::findOrFail($id);
        $f = $request->validate(['date' => 'required|date_format:Y-m-d', 'offs' => 'required|array|max:500', 'offs.*.student_id' => 'required|integer', 'offs.*.meals' => 'present|array', 'offs.*.meals.*' => 'in:breakfast,lunch,dinner']);
        $this->mess->setOffs($h, $f['date'], $f['offs'], $request->user());
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->mess->day($h, $f['date'])]);
    }

    /** GET /hostel/{id}/bazar?month= */
    public function bazar(Request $request, int $id)
    {
        $h = Hostel::findOrFail($id);
        $f = $request->validate(['month' => 'nullable|date_format:Y-m']);
        $month = $f['month'] ?? now()->format('Y-m');
        $rows = HostelMessBazar::where('hostel_id', $h->id)->where('date', 'like', $month . '-%')->orderBy('date')->orderBy('id')->get();
        $reversed = HostelMessBazar::whereIn('reversal_of_id', $rows->pluck('id'))->pluck('reversal_of_id')->all();
        return response()->json(['success' => true, 'data' => ['month' => $month, 'total' => Money::format($rows->sum(fn ($b) => Money::toPaisa((string) $b->amount))),
            'rows' => $rows->map(fn ($b) => ['id' => $b->id, 'date' => $b->date->toDateString(), 'amount' => (string) $b->amount, 'note' => $b->note, 'reversal_of_id' => $b->reversal_of_id, 'reversed' => in_array($b->id, $reversed, true)])->values()]]);
    }

    /** POST /hostel/{id}/bazar {date, amount, note?, method?} */
    public function addBazar(Request $request, int $id)
    {
        $h = Hostel::findOrFail($id);
        $f = $request->validate(['date' => 'required|date_format:Y-m-d|before_or_equal:today', 'amount' => ['required', 'regex:/^\d{1,8}(\.\d{1,2})?$/', 'not_in:0,0.0,0.00'],
            'note' => 'nullable|string|max:255', 'method' => 'nullable|in:cash,bank,bkash,nagad,rocket,other']);
        $b = $this->mess->addBazar($h, $f, $request->user());
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['id' => $b->id, 'date' => $b->date->toDateString(), 'amount' => (string) $b->amount, 'note' => $b->note]], 201);
    }

    /** POST /hostel/bazar/{id}/reverse */
    public function reverseBazar(Request $request, int $id)
    {
        $b = $this->mess->reverseBazar(HostelMessBazar::findOrFail($id), $request->user());
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['id' => $b->id, 'amount' => (string) $b->amount, 'reversal_of_id' => $b->reversal_of_id]]);
    }

    /** POST /hostel/{id}/mess/close {month} */
    public function close(Request $request, int $id)
    {
        $h = Hostel::findOrFail($id);
        $f = $request->validate(['month' => 'required|date_format:Y-m']);
        $m = $this->mess->close($h, $f['month'], $request->user());
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['month' => $m->month, 'members' => $m->bills()->count(), 'meal_rate' => $m->meal_rate !== null ? (string) $m->meal_rate : null]]);
    }

    /** GET /hostel/{id}/mess/bills?month= */
    public function bills(Request $request, int $id)
    {
        $h = Hostel::findOrFail($id);
        $f = $request->validate(['month' => 'required|date_format:Y-m']);
        $m = HostelMessMonth::where('hostel_id', $h->id)->where('month', $f['month'])->first();
        if (!$m) return response()->json(['success' => true, 'data' => null]);
        $rows = HostelMessBill::with('student.user:id,name')->where('mess_month_id', $m->id)->orderBy('id')->get();
        return response()->json(['success' => true, 'data' => ['month' => $m->month, 'mode' => $m->mode, 'total_meals' => (string) $m->total_meals, 'total_bazar' => (string) $m->total_bazar,
            'meal_rate' => $m->meal_rate !== null ? (string) $m->meal_rate : null, 'rows' => $rows->map(fn ($b) => ['id' => $b->id, 'kind' => $b->kind, 'meals' => (string) $b->meals, 'amount' => (string) $b->amount, 'note' => $b->note,
            'student' => ['id' => $b->student_id, 'name' => $b->student?->user?->name, 'student_id' => $b->student?->student_id]])->values()]]);
    }

    /** POST /hostel/mess-bills/{id}/adjust {amount, note} - a new row, the bill stays */
    public function adjust(Request $request, int $id)
    {
        $bill = HostelMessBill::findOrFail($id);
        $f = $request->validate(['amount' => ['required', 'regex:/^-?\d{1,6}(\.\d{1,2})?$/'], 'note' => 'required|string|max:255']);
        $row = $this->mess->adjust($bill, $f['amount'], $f['note'], $request->user());
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['id' => $row->id, 'amount' => (string) $row->amount, 'kind' => $row->kind]], 201);
    }

    /** PUT /hostel/allocations/{id}/mess {with_mess} - applies to the days not yet closed */
    public function setMember(Request $request, int $id)
    {
        $a = HostelAllocation::findOrFail($id);
        $f = $request->validate(['with_mess' => 'required|boolean']);
        $a->update(['with_mess' => $f['with_mess']]);
        \App\Models\AuditLog::record('hostel.mess_member', $a, ['with_mess' => (bool) $f['with_mess']]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['id' => $a->id, 'with_mess' => (bool) $a->with_mess]]);
    }

    /** GET /student/hostel/mess */
    public function mine(Request $request)
    {
        return response()->json(['success' => true, 'data' => $this->mess->forStudent(Student::where('user_id', $request->user()->id)->firstOrFail())]);
    }

    /** GET /parent/children/{id}/hostel/mess */
    public function child(Request $request, int $id)
    {
        $s = Student::whereKey($id)->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail();
        return response()->json(['success' => true, 'data' => $this->mess->forStudent($s)]);
    }

    public static function settings(Hostel $h): array
    {
        return ['mess_mode' => $h->mess_mode ?? 'none', 'mess_monthly_fee' => $h->mess_monthly_fee !== null ? (string) $h->mess_monthly_fee : null,
            'breakfast_rate' => $h->breakfast_rate !== null ? (string) $h->breakfast_rate : null, 'lunch_rate' => $h->lunch_rate !== null ? (string) $h->lunch_rate : null, 'dinner_rate' => $h->dinner_rate !== null ? (string) $h->dinner_rate : null,
            'breakfast_weight' => (string) ($h->breakfast_weight ?? '1.00'), 'lunch_weight' => (string) ($h->lunch_weight ?? '1.00'), 'dinner_weight' => (string) ($h->dinner_weight ?? '1.00')];
    }
}

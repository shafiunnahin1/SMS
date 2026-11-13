<?php

namespace App\Http\Controllers\Leads;

use App\Http\Controllers\Controller;
use App\Models\{AdmissionLead, User};
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// D203 REF.1: a teacher or a staff member, signed in to their own account, fills in an admission application for someone they
// bring; they become its referrer. They see only their own referred applications (name, interested program, status, date) -
// never another person's, never the phone, note or follow-up. No duty key: their own identity (D203 (2)). This only records who
// referred whom; any benefit is the institution's own business outside the app.
class LeadReferralController extends Controller
{
    public function index(Request $request)
    {
        $request->validate(['page' => 'nullable|integer|min:1']);
        $page = AdmissionLead::with('program:id,name')->where('referred_by', $request->user()->id)->orderByDesc('id')->paginate(25);
        return response()->json(['success' => true, 'data' => collect($page->items())->map(fn ($l) => [
            'id' => $l->id, 'name' => $l->name, 'program' => $l->program?->name, 'status' => $l->status, 'created_at' => $l->created_at?->toIso8601String(),
        ])->values(), 'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(),
            'admitted' => AdmissionLead::where('referred_by', $request->user()->id)->where('status', 'enrolled')->count()]]);
    }

    public function store(Request $request)
    {
        $t = Tenancy::current()->id;
        $d = $request->validate([
            'name' => 'required|string|max:100', 'phone' => ['required', 'string', 'regex:/^(?:\+?88)?01[3-9]\d{8}$/'],
            'guardian_name' => 'nullable|string|max:100', 'email' => 'nullable|email|max:100', 'current_class' => 'nullable|string|max:100',
            'message' => 'nullable|string|max:500',
            'interested_program_id' => ['nullable', 'integer', Rule::exists('programs', 'id')->where('institution_id', $t)],
            'interested_batch_id' => ['nullable', 'integer', Rule::exists('batches', 'id')->where('institution_id', $t)->where('program_id', (int) $request->input('interested_program_id'))],
            // the referrer is always the signed-in user; nothing else is the referrer's to set
            'referred_by' => 'prohibited', 'source' => 'prohibited', 'status' => 'prohibited', 'note' => 'prohibited', 'follow_up_date' => 'prohibited',
            'institution_id' => 'prohibited', 'created_by' => 'prohibited', 'converted_student_id' => 'prohibited', 'consented_at' => 'prohibited', 'ip_hash' => 'prohibited',
        ]);
        $me = $request->user()->id;
        $lead = AdmissionLead::create(array_merge($d, ['phone' => User::normalisePhone($d['phone']), 'source' => 'referral', 'status' => 'new', 'referred_by' => $me, 'created_by' => $me]));
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['id' => $lead->id, 'name' => $lead->name,
            'program' => $lead->program?->name, 'status' => $lead->status, 'created_at' => $lead->created_at?->toIso8601String()]], 201);
    }
}

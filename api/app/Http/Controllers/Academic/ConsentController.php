<?php

namespace App\Http\Controllers\Academic;

use App\Http\Controllers\Controller;
use App\Models\{Consent, Student};
use App\Services\ConsentService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// Step 4.2 routes; Spike S6 builds the parent's side: GET /parent/consents and PUT /parent/consents/{type} { status } for their own
// children only (privacy-and-consent.md section 3). Step 4.2: the admin records a guardian's PAPER consent (GET|POST
// /students/{id}/consents); revoking on paper is recorded the same way. The printable consent-form PDF waits for the D50 renderer.
class ConsentController extends Controller
{
    public function __construct(private ConsentService $consents) {}

    public function mine(Request $request)
    {
        $children = $this->children($request)->load(['user:id,name']);
        $saved = Consent::whereIn('student_id', $children->pluck('id'))->get()->groupBy('student_id');

        return response()->json(['success' => true, 'data' => [
            'types' => ConsentService::TYPES,
            'children' => $children->map(fn ($s) => [
                'id' => $s->id, 'name' => $s->user?->name,
                'consents' => collect(ConsentService::TYPES)->mapWithKeys(fn ($t) => [$t => optional($saved->get($s->id)?->firstWhere('type', $t))->only(['status', 'method', 'granted_at', 'revoked_at'])]),
            ])->values(),
            'needs_data_consent' => $children->contains(fn ($s) => !$this->consents->hasDataConsent($s)),
        ]]);
    }

    /** GET /students/{id}/consents (admin) - every type with its current state */
    public function index(int $id)
    {
        $student = Student::findOrFail($id);
        $saved = Consent::where('student_id', $student->id)->get()->keyBy('type');
        return response()->json(['success' => true, 'data' => collect(ConsentService::TYPES)->map(fn ($t) => ['type' => $t] + (
            $saved->has($t) ? $saved[$t]->only(['status', 'method', 'guardian_name', 'granted_at', 'revoked_at']) : ['status' => null]))->values()]);
    }

    /** POST /students/{id}/consents (admin) { type, status, guardian_name? } - the paper form the guardian signed */
    public function store(Request $request, int $id)
    {
        $student = Student::findOrFail($id);
        $data = $request->validate(['type' => ['required', Rule::in(ConsentService::TYPES)], 'status' => ['required', Rule::in(['granted', 'revoked'])],
            'guardian_name' => 'nullable|string|max:100']);
        $data['status'] === 'granted'
            ? $this->consents->record($student, $data['type'], 'paper', ['name' => $data['guardian_name'] ?? null], $request->user()->id)
            : $this->consents->revoke($student, $data['type'], 'paper');
        return $this->index($id);
    }

    /** One answer per type for all of the parent's children (the parent gives it once, for their family) */
    public function update(Request $request, string $type)
    {
        abort_unless(in_array($type, ConsentService::TYPES, true), 404);
        $data = $request->validate(['status' => ['required', Rule::in(['granted', 'revoked'])]]);
        $user = $request->user();
        foreach ($this->children($request) as $s) {
            $data['status'] === 'granted'
                ? $this->consents->record($s, $type, 'portal', ['name' => $user->name, 'phone' => $user->phone])
                : $this->consents->revoke($s, $type);
        }
        return $this->mine($request);
    }

    private function children(Request $request)
    {
        return Student::whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->orderBy('id')->get();
    }
}

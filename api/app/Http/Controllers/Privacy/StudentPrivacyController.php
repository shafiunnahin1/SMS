<?php

namespace App\Http\Controllers\Privacy;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Student};
use App\Services\Privacy\StudentErasureService;
use Illuminate\Http\Request;

// docs/legal/privacy-and-consent.md section 5 (D27): the admin anonymizes a student after an erasure request (typing the
// student's name confirms it - it cannot be undone); a parent downloads everything kept about their own child.
class StudentPrivacyController extends Controller
{
    public function __construct(private StudentErasureService $erasure) {}

    /** POST /students/{id}/anonymize {confirm_name} (admin) */
    public function anonymize(Request $request, int $id)
    {
        $student = Student::with('user:id,name')->findOrFail($id);
        if ($student->anonymized_at) throw new BusinessException('already anonymized', 'already_anonymized', 422);
        $request->validate(['confirm_name' => 'required|string|max:150']);
        if (trim((string) $request->input('confirm_name')) !== trim((string) $student->user?->name)) {
            throw new BusinessException('the typed name does not match', 'confirm_name_mismatch', 422);
        }
        $this->erasure->anonymize($student, $request->user()->id);
        return response()->json(['success' => true, 'data' => ['id' => $student->id, 'anonymized_at' => $student->fresh()->anonymized_at?->toIso8601String()],
            'message' => __('messages.saved')]);
    }

    /** GET /parent/children/{id}/export (parent, own child only - 404 otherwise) */
    public function export(Request $request, int $id)
    {
        $student = Student::whereKey($id)->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail();
        $data = $this->erasure->export($student);
        AuditLog::record('student.exported', $student, ['by' => 'parent']);
        return response()->json(['success' => true, 'data' => $data])
            ->header('Content-Disposition', 'attachment; filename="student-' . $student->student_id . '.json"');
    }
}

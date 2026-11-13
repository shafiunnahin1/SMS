<?php

namespace App\Http\Controllers\Documents;

use App\Http\Controllers\Controller;
use App\Models\{Student, TcCertificate};
use App\Services\Documents\TcService;
use App\Services\PdfService;
use App\Support\BanglaFormat;
use Illuminate\Http\Request;

// D210 PTC.1: transfer certificates (admin) - the list, issuing one for a student (with its memo number), the printed TC (memo number
// and dates in Bangla digits, the date line in both calendars) and cancelling one (kept, marked; its memo number cancelled).
class TcController extends Controller
{
    public function __construct(private TcService $tcs) {}

    public function index(Request $request)
    {
        $f = $request->validate(['student_id' => 'nullable|integer', 'page' => 'nullable|integer|min:1']);
        $page = TcCertificate::with('student:id,user_id,student_id', 'student.user:id,name')->when($f['student_id'] ?? null, fn ($q, $s) => $q->where('student_id', $s))->orderByDesc('id')->paginate(30);
        return response()->json(['success' => true, 'data' => collect($page->items())->map(fn ($tc) => $this->row($tc))->values(),
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()]]);
    }

    /** POST /students/{id}/tc {reason?, last_class?, last_attendance_date?, conduct?} */
    public function store(Request $request, int $id)
    {
        $student = Student::findOrFail($id);
        $d = $request->validate(['reason' => 'nullable|string|max:500', 'last_class' => 'nullable|string|max:50',
            'last_attendance_date' => 'nullable|date_format:Y-m-d|before_or_equal:today', 'conduct' => 'nullable|string|max:50']);
        $tc = $this->tcs->issue($student, $d, $request->user()->id);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($tc->load('student:id,user_id,student_id', 'student.user:id,name'))], 201);
    }

    /** GET /tc/{id}/pdf */
    public function pdf(int $id)
    {
        $tc = TcCertificate::with('student.user:id,name')->findOrFail($id);
        $s = $tc->student;
        $data = ['tc' => $tc, 'student' => $s, 'memo_bn' => BanglaFormat::digits($tc->memo_no ?? ''), 'date_line' => BanglaFormat::dateLine($tc->issued_date),
            'from_bn' => $s->admission_date ? BanglaFormat::digits($s->admission_date->format('d/m/Y')) : null,
            'to_bn' => $tc->last_attendance_date ? BanglaFormat::digits($tc->last_attendance_date->format('d/m/Y')) : null];
        return response(app(PdfService::class)->render('pdf.tc', $data, 'a4'), 200, ['Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="' . $tc->tc_number . '.pdf"', 'Cache-Control' => 'no-store']);
    }

    /** POST /tc/{id}/cancel {reason} */
    public function cancel(Request $request, int $id)
    {
        $tc = TcCertificate::findOrFail($id);
        $d = $request->validate(['reason' => 'required|string|max:255']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($this->tcs->cancel($tc, $d['reason'])->load('student:id,user_id,student_id', 'student.user:id,name'))]);
    }

    private function row(TcCertificate $tc): array
    {
        return ['id' => $tc->id, 'tc_number' => $tc->tc_number, 'memo_no' => $tc->memo_no, 'memo_no_bn' => BanglaFormat::digits($tc->memo_no ?? ''),
            'student' => $tc->student ? ['id' => $tc->student->id, 'name' => $tc->student->user?->name, 'student_id' => $tc->student->student_id] : null,
            'reason' => $tc->reason, 'last_class' => $tc->last_class, 'last_attendance_date' => $tc->last_attendance_date?->toDateString(), 'conduct' => $tc->conduct,
            'issued_date' => $tc->issued_date?->toDateString(), 'revoked' => (bool) $tc->revoked_at];
    }
}

<?php

namespace App\Http\Controllers\Documents;

use App\Http\Controllers\Controller;
use App\Models\{Certificate, Student};
use App\Services\Documents\CertificateService;
use App\Services\Exams\AdmitCardService;
use App\Services\PdfService;
use App\Support\BanglaFormat;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// D210 CERT.1: certificates (admin) - the list, issuing one (attestation, testimonial, participation, merit, appreciation, completion)
// with its memo number and verify code, the print (memo number and dates in Bangla digits, the date line in both calendars, a QR to
// the public check) and cancelling one; plus the public check GET /public/verify/{code} (docs/modules/quick-wins.md section 2).
class CertificateController extends Controller
{
    public function __construct(private CertificateService $certs) {}

    public function index(Request $request)
    {
        $f = $request->validate(['student_id' => 'nullable|integer', 'type' => ['nullable', Rule::in(Certificate::TYPES)], 'page' => 'nullable|integer|min:1']);
        $page = Certificate::with('student:id,user_id,student_id', 'student.user:id,name')->when($f['student_id'] ?? null, fn ($q, $s) => $q->where('student_id', $s))
            ->when($f['type'] ?? null, fn ($q, $t) => $q->where('type', $t))->orderByDesc('id')->paginate(30);
        return response()->json(['success' => true, 'data' => collect($page->items())->map(fn ($c) => $this->row($c))->values(),
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()]]);
    }

    /** POST /students/{id}/certificates {type, title, description?} */
    public function store(Request $request, int $id)
    {
        $student = Student::with('user:id,name')->findOrFail($id);
        $d = $request->validate(['type' => ['required', Rule::in(Certificate::TYPES)], 'title' => 'required|string|max:150', 'description' => 'nullable|string|max:3000']);
        $c = $this->certs->issue($student, $d, $request->user()->id);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($c->load('student:id,user_id,student_id', 'student.user:id,name'))], 201);
    }

    /** GET /certificates/{id}/pdf */
    public function pdf(Request $request, int $id)
    {
        $c = Certificate::with('student.user:id,name')->findOrFail($id);
        $url = $request->getSchemeAndHttpHost() . '/verify/' . $c->verify_code;
        $data = ['c' => $c, 'student' => $c->student, 'memo_bn' => BanglaFormat::digits($c->memo_no ?? ''), 'date_line' => BanglaFormat::dateLine($c->issued_date),
            'qr' => $c->verify_code ? AdmitCardService::qr($url) : null, 'verify_url' => $url];
        return response(app(PdfService::class)->render('pdf.certificate', $data, 'a4'), 200, ['Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="' . $c->certificate_no . '.pdf"', 'Cache-Control' => 'no-store']);
    }

    /** POST /certificates/{id}/cancel {reason} */
    public function cancel(Request $request, int $id)
    {
        $c = Certificate::findOrFail($id);
        $d = $request->validate(['reason' => 'required|string|max:255']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($this->certs->cancel($c, $d['reason'])->load('student:id,user_id,student_id', 'student.user:id,name'))]);
    }

    /** GET /public/verify/{code} - tenant host, no login, throttled; the same answer shape for every unknown code */
    public function verify(string $code)
    {
        return response()->json(['success' => true, 'data' => $this->certs->check($code)]);
    }

    private function row(Certificate $c): array
    {
        return ['id' => $c->id, 'certificate_no' => $c->certificate_no, 'type' => $c->type, 'title' => $c->title, 'description' => $c->description,
            'memo_no' => $c->memo_no, 'memo_no_bn' => BanglaFormat::digits($c->memo_no ?? ''), 'verify_code' => $c->verify_code,
            'student' => $c->student ? ['id' => $c->student->id, 'name' => $c->student->user?->name, 'student_id' => $c->student->student_id] : null,
            'issued_date' => $c->issued_date?->toDateString(), 'revoked' => (bool) $c->revoked_at];
    }
}

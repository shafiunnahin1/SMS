<?php

namespace App\Http\Controllers\Documents;

use App\Http\Controllers\Controller;
use App\Models\{OfficialLetter, User};
use App\Services\Documents\LetterService;
use App\Services\PdfService;
use App\Support\BanglaFormat;
use Illuminate\Http\Request;

// D210 LTR.1: official letters (admin) - the list, writing one (it takes the next memo number), the print (memo number and dates in
// Bangla digits, the date line in both calendars, recipient, subject, body, signature) and cancelling one (kept, marked).
class LetterController extends Controller
{
    public function __construct(private LetterService $letters) {}

    public function index(Request $request)
    {
        $request->validate(['page' => 'nullable|integer|min:1']);
        $page = OfficialLetter::query()->orderByDesc('id')->paginate(30);
        return response()->json(['success' => true, 'data' => collect($page->items())->map(fn ($l) => $this->row($l))->values(),
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()]]);
    }

    public function store(Request $request)
    {
        $d = $request->validate(['subject' => 'required|string|max:200', 'recipient' => 'required|string|max:255', 'body' => 'required|string|max:10000']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($this->letters->issue($d, $request->user()->id))], 201);
    }

    public function pdf(int $id)
    {
        $l = OfficialLetter::findOrFail($id);
        $data = ['l' => $l, 'memo_bn' => BanglaFormat::digits($l->memo_no), 'date_line' => BanglaFormat::dateLine($l->issued_date),
            'signer' => User::inTenant()->whereKey($l->issued_by)->value('name')];
        return response(app(PdfService::class)->render('pdf.letter', $data, 'a4'), 200, ['Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="letter-' . $l->id . '.pdf"', 'Cache-Control' => 'no-store']);
    }

    public function cancel(Request $request, int $id)
    {
        $l = OfficialLetter::findOrFail($id);
        $d = $request->validate(['reason' => 'required|string|max:255']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($this->letters->cancel($l, $d['reason']))]);
    }

    private function row(OfficialLetter $l): array
    {
        return ['id' => $l->id, 'memo_no' => $l->memo_no, 'memo_no_bn' => BanglaFormat::digits($l->memo_no), 'subject' => $l->subject, 'recipient' => $l->recipient,
            'body' => $l->body, 'issued_date' => $l->issued_date?->toDateString(), 'status' => $l->status];
    }
}

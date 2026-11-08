<?php

namespace App\Http\Controllers\Cards;

use App\Http\Controllers\Controller;
use App\Models\{Batch, Exam, Student};
use App\Services\Exams\AdmitCardService;
use App\Services\PdfService;
use Illuminate\Http\Request;

// D193 ADM.1: admit cards (advanced-features.md section 7). The admin prints them for the exam (optionally one batch); a student
// downloads their own only after the admin made them available and from the "available from" date. No file is stored.
class AdmitCardController extends Controller
{
    public function __construct(private AdmitCardService $cards) {}

    /** GET /exams/{id}/admit-cards/bulk?batch_id= (admin) */
    public function bulk(Request $request, int $id)
    {
        $exam = Exam::with('program:id,name')->findOrFail($id);
        $batchId = $request->validate(['batch_id' => 'nullable|integer'])['batch_id'] ?? null;
        if ($batchId) Batch::where('program_id', $exam->program_id)->findOrFail($batchId);
        return $this->send($this->cards->build($exam, $batchId ? (int) $batchId : null), "admit-cards-{$exam->id}.pdf");
    }

    /** GET /student/exams/{id}/admit-card (student, own) */
    public function mine(Request $request, int $id)
    {
        $student = Student::where('user_id', $request->user()->id)->firstOrFail();
        // D197 AAD.1: held back by dues - 403 with the amount and the reason, never a silent refusal
        if ($b = app(\App\Services\Fees\DueBlockService::class)->isBlocked($student, 'admit_card')) {
            throw new \App\Exceptions\BusinessException($b['reason'], 'blocked_by_dues', 403, ['reason' => $b['reason']]);
        }
        $exam = Exam::with('program:id,name')->where('admit_card_available', true)
            ->where(fn ($q) => $q->whereNull('admit_card_from')->orWhere('admit_card_from', '<=', now()->toDateString()))->findOrFail($id);
        $data = $this->cards->build($exam, null, $student->id);
        abort_if($data['cards'] === [], 404);
        return $this->send($data, "admit-card-{$student->student_id}-{$exam->id}.pdf");
    }

    private function send(array $data, string $name)
    {
        return response(app(PdfService::class)->render('pdf.admit-cards', $data, 'a5'), 200, ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="' . $name . '"',
            'X-Blocked-Count' => (string) ($data['blocked_count'] ?? 0)]);   // D197 AAD.1: how many the dues held back
    }
}

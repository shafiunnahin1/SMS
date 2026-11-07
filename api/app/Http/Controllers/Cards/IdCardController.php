<?php

namespace App\Http\Controllers\Cards;

use App\Http\Controllers\Controller;
use App\Models\{Batch, Enrollment, Program, Student};
use App\Services\Exams\AdmitCardService;
use App\Services\PdfService;
use Illuminate\Http\Request;

// D193 ADM.1: student ID cards (pdf-reports.md "ID Card" A6; extended-features.md section 13 bulk: 6 per A4 page). Admin only.
// The card shows the photo (the consent form excludes the ID card from photo publishing), name, code, class and roll; the QR holds
// only the student code.
class IdCardController extends Controller
{
    /** GET /students/{id}/card */
    public function show(int $id)
    {
        $student = Student::with(['user:id,name', 'primaryEnrollment.program:id,name', 'primaryEnrollment.batch:id,name'])->findOrFail($id);
        $card = $this->card($student, $student->primaryEnrollment);
        return response(app(PdfService::class)->render('pdf.id-cards', ['cards' => [$card], 'single' => true], 'a6'), 200,
            ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="id-card-' . $student->student_id . '.pdf"']);
    }

    /** GET /students/id-cards/bulk?program_id=&batch_id= */
    public function bulk(Request $request)
    {
        $v = $request->validate(['program_id' => 'required|integer', 'batch_id' => 'nullable|integer']);
        $program = Program::findOrFail($v['program_id']);
        if (!empty($v['batch_id'])) Batch::where('program_id', $program->id)->findOrFail($v['batch_id']);
        $cards = Enrollment::with(['student.user:id,name', 'program:id,name', 'batch:id,name'])->where('program_id', $program->id)->where('status', 'active')
            ->when(!empty($v['batch_id']), fn ($q) => $q->where('batch_id', $v['batch_id']))->orderBy('batch_id')->orderBy('roll_no')->get()
            ->unique('student_id')->filter(fn ($e) => $e->student && $e->student->status === 'active')->map(fn ($e) => $this->card($e->student, $e))->values()->all();
        return response(app(PdfService::class)->render('pdf.id-cards', ['cards' => $cards, 'single' => false], 'a4'), 200,
            ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="id-cards-' . $program->id . '.pdf"']);
    }

    private function card(Student $s, ?Enrollment $e): array
    {
        return ['name' => $s->user?->name, 'code' => $s->student_id, 'roll' => $e?->roll_no, 'blood_group' => $s->blood_group,
            'class' => trim(($e?->program?->name ?? '') . ($e?->batch ? ' — ' . $e->batch->name : '')),
            'photo' => AdmitCardService::photo($s), 'qr' => AdmitCardService::qr((string) $s->student_id)];
    }
}

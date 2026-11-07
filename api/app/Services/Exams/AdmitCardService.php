<?php

namespace App\Services\Exams;

use App\Exceptions\BusinessException;
use App\Models\{Enrollment, Exam, ExamSubject, Student};
use Endroid\QrCode\QrCode;
use Endroid\QrCode\Writer\SvgWriter;
use Illuminate\Support\Facades\Storage;

// D193 ADM.1 (advanced-features.md section 7, Revision 6.3): one admit card per actively enrolled student of the exam's program
// (and batch, when the exam or the request names one). The subject rows come from exam_subjects; every row needs its date first
// (422 exam_schedule_incomplete). The QR carries only the student code and the exam id - no name, phone or other personal data.
class AdmitCardService
{
    /** @return array{exam: array, subjects: array, cards: array} */
    public function build(Exam $exam, ?int $batchId = null, ?int $studentId = null): array
    {
        $subjects = ExamSubject::with('subject:id,name')->where('exam_id', $exam->id)->orderBy('exam_date')->orderBy('start_time')->orderBy('sort_order')->get();
        if ($subjects->isEmpty() || $subjects->contains(fn ($s) => !$s->exam_date)) {
            throw new BusinessException(__('errors.exam_schedule_incomplete'), 'exam_schedule_incomplete', 422);
        }
        $batch = $exam->batch_id ?? $batchId;
        $enr = Enrollment::with(['student.user:id,name', 'batch:id,name'])->where('program_id', $exam->program_id)->where('status', 'active')
            ->when($batch, fn ($q) => $q->where('batch_id', $batch))->when($studentId, fn ($q) => $q->where('student_id', $studentId))
            ->orderBy('batch_id')->orderBy('roll_no')->get()->unique('student_id');
        $program = $exam->program?->name;
        return [
            'exam' => ['id' => $exam->id, 'name' => $exam->name, 'academic_year' => $exam->academic_year, 'center' => $exam->exam_center, 'instructions' => $exam->admit_card_instructions],
            'subjects' => $subjects->map(fn ($s) => ['subject' => $s->subject?->name, 'date' => $s->exam_date?->format('d/m/Y'),
                'start' => $s->start_time ? substr((string) $s->start_time, 0, 5) : null, 'end' => $s->end_time ? substr((string) $s->end_time, 0, 5) : null, 'room' => $s->room])->values()->all(),
            'cards' => $enr->map(fn ($e) => ['name' => $e->student?->user?->name, 'code' => $e->student?->student_id, 'roll' => $e->roll_no,
                'class' => trim($program . ($e->batch ? ' — ' . $e->batch->name : '')), 'photo' => self::photo($e->student),
                'qr' => self::qr($e->student?->student_id . '|' . $exam->id)])->values()->all(),
        ];
    }

    /** The student's photo as a data URI for the PDF (private disk; never a public url) */
    public static function photo(?Student $s): ?string
    {
        if (!$s?->photo || !Storage::disk('private')->exists($s->photo)) return null;
        return 'data:' . (Storage::disk('private')->mimeType($s->photo) ?: 'image/jpeg') . ';base64,' . base64_encode(Storage::disk('private')->get($s->photo));
    }

    public static function qr(string $text): string
    {
        return 'data:image/svg+xml;base64,' . base64_encode((new SvgWriter())->write(new QrCode($text, size: 90, margin: 0))->getString());
    }
}

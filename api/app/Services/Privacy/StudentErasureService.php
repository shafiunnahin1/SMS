<?php

namespace App\Services\Privacy;

use App\Models\{AuditLog, Attendance, Consent, Enrollment, Exam, FeePayment, ImportRow, Result, Student, User};
use App\Services\Auth\TokenService;
use App\Services\{ExamService, FeeService, InstitutionSettings};
use App\Support\{StudentFiles, Tenancy};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

// docs/legal/privacy-and-consent.md section 5 (D27). anonymize(): the institution's decision after an erasure request - every
// personal field goes, every file under institutions/{inst}/students/{sid}/ goes in ONE deleteDirectory (file-storage.md
// section 2), the student's login and the parent link go; enrollments, attendance, results and fee payments STAY (academic and
// financial records, D32) but no longer point at a person. Cannot be undone. R1 has no documents / health / behaviour tables.
class StudentErasureService
{
    public function anonymize(Student $s, int $by): void
    {
        DB::transaction(function () use ($s, $by) {
            $parents = $s->parents()->get();
            $s->forceFill([
                'father_name' => null, 'mother_name' => null, 'address' => null, 'guardian_phone' => '00000000000',
                'date_of_birth' => null, 'blood_group' => null, 'religion' => null, 'photo' => null, 'studying_at' => null,
                'board_reg_no' => null, 'board_roll_no' => null, 'status' => 'inactive', 'anonymized_at' => now(),
            ])->save();
            if ($s->user) {
                $s->user->forceFill(['name' => 'Anonymized #' . $s->id, 'email' => null, 'phone' => null, 'username' => 'anon-' . $s->id,
                    'avatar' => null, 'is_active' => false, 'password' => Str::random(40)])->save();
                app(TokenService::class)->revokeAll($s->user);
                \App\Http\Controllers\Ai\AiAttachmentController::forget($s->user->id);   // D166 (5): chat photos at once
            }
            StudentFiles::deleteAll($s);                                                    // photo and every other file of this student
            Consent::where('student_id', $s->id)->delete();
            // the raw spreadsheet row that created this student still holds the name and phones
            ImportRow::where('created_table', 'students')->where('created_id', $s->id)->update(['data' => null]);

            // the parent link goes; a parent left with no other child is switched off and anonymized too
            $s->parents()->detach();
            foreach ($parents as $p) {
                if (Student::whereHas('parents', fn ($q) => $q->whereKey($p->id))->exists()) continue;     // still a parent of another child here
                $p->forceFill(['name' => 'Anonymized parent #' . $p->id, 'email' => null, 'phone' => null, 'avatar' => null, 'is_active' => false,
                    'password' => Str::random(40)])->save();
                app(TokenService::class)->revokeAll($p);
            }
            AuditLog::record('student.anonymized', $s, ['by' => $by]);                    // the audit row holds no personal data
        });
    }

    /** GET /parent/children/{id}/export (section 5.2): everything the institution keeps about this child, as JSON */
    public function export(Student $s): array
    {
        $i = Tenancy::current();
        $useGpa = app(InstitutionSettings::class)->general($i)['use_gpa'];
        $s->loadMissing('user:id,name,phone,email');
        $published = Exam::where('status', 'published')->whereIn('id', Result::where('student_id', $s->id)->select('exam_id'))->orderBy('id')->get();
        return [
            'exported_at' => now()->toIso8601String(),
            'institution' => ['name' => $i->name],
            'student' => ['student_id' => $s->student_id, 'name' => $s->user?->name, 'date_of_birth' => $s->date_of_birth?->toDateString(), 'gender' => $s->gender,
                'blood_group' => $s->blood_group, 'religion' => $s->religion, 'father_name' => $s->father_name, 'mother_name' => $s->mother_name,
                'guardian_phone' => $s->guardian_phone, 'address' => $s->address, 'admission_date' => $s->admission_date?->toDateString(), 'status' => $s->status,
                'studying_at' => $s->studying_at, 'board_reg_no' => $s->board_reg_no, 'board_roll_no' => $s->board_roll_no, 'has_photo' => (bool) $s->photo],
            'enrollments' => Enrollment::where('student_id', $s->id)->with(['program:id,name', 'batch:id,name'])->orderBy('id')->get()
                ->map(fn ($e) => ['program' => $e->program?->name, 'batch' => $e->batch?->name, 'roll_no' => $e->roll_no, 'status' => $e->status])->values(),
            'attendance' => Attendance::where('student_id', $s->id)->orderBy('date')->get(['date', 'status'])
                ->map(fn ($a) => ['date' => $a->date?->toDateString(), 'status' => $a->status])->values(),
            'results' => $published->map(fn ($exam) => app(ExamService::class)->sheet($exam, $s, $useGpa))->values(),
            'fee_payments' => FeePayment::where('student_id', $s->id)->with('feeCategory:id,name')->orderBy('paid_at')->orderBy('line_no')->get()
                ->map(fn ($p) => ['receipt_no' => $p->receipt_no, 'paid_at' => $p->paid_at?->toIso8601String(), 'item' => $p->feeCategory?->name, 'period' => $p->month,
                    'amount' => $p->paid_amount, 'method' => $p->payment_method])->values(),
            'dues' => app(FeeService::class)->dueLines($s)->map(fn ($l) => ['item' => $l['category'], 'period' => $l['period'], 'amount' => $l['amount']])->values(),
            'consents' => Consent::where('student_id', $s->id)->orderBy('type')->get()->map(fn ($c) => ['type' => $c->type, 'status' => $c->status,
                'method' => $c->method, 'granted_at' => $c->granted_at?->toIso8601String(), 'revoked_at' => $c->revoked_at?->toIso8601String()])->values(),
        ];
    }
}

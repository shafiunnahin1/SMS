# New Features — Additional Module Plans

---

## 1. Excel Bulk Mark Upload (Teacher)

### Overview
Teacher Excel-এ সব ছাত্রের মার্ক দিয়ে একসাথে upload করতে পারবেন।

### API
```
GET  /exams/{examId}/marks/template?subject_id=  → Mark entry template (columns from exam_subjects)
POST /exams/{examId}/marks/import       → Bulk mark upload
```

### Template Format (Revision 7)
Template অনুযায়ী dynamic: `GET /exams/{examId}/marks/template?subject_id=` `exam_subjects` পড়ে কলাম বানায়।
```
component ছাড়া বিষয়:   | student_id | student_name | roll_no | marks_obtained | is_absent |
৭০+৩০ বিষয় (components): | student_id | student_name | roll_no | written | mcq | is_absent |      (key = exam_subjects.components[].key)
```
### MarkImport.php
```php
class MarkImport implements ToCollection, WithHeadingRow, WithValidation
{
    public array $failed = [];

    public function __construct(private Exam $exam, private int $subjectId) {}

    public function collection(Collection $rows): void
    {
        $es = ExamSubject::where('exam_id', $this->exam->id)->where('subject_id', $this->subjectId)->firstOrFail();
        $keys = collect($es->components ?? [])->pluck('key')->all();
        $ids  = Student::whereIn('student_id', $rows->pluck('student_id'))->pluck('id', 'student_id');   // tenant-scoped

        $payload = [];
        foreach ($rows as $i => $row) {
            if (!isset($ids[$row['student_id']])) { $this->failed[] = ['row' => $i + 2, 'error' => 'অজানা student_id']; continue; }
            $payload[] = [
                'student_id'     => $ids[$row['student_id']],
                'is_absent'      => (bool) ($row['is_absent'] ?? false),
                'marks_obtained' => $keys ? null : ($row['marks_obtained'] ?? null),
                'components'     => $keys ? collect($keys)->mapWithKeys(fn ($k) => [$k => $row[$k] ?? 0])->all() : null,
            ];
        }
        // Grade, pass/fail, limits (full_marks / component maxima) are decided in ONE place:
        app(ResultService::class)->bulkSaveMarks($this->exam, $this->subjectId, $payload);
    }

    public function rules(): array
    {
        return ['student_id' => ['required', 'string'], 'is_absent' => ['nullable', 'boolean']];   // numeric limits are enforced by ResultService (422 with the subject's own maximum)
    }
}
```
Importer-এ কোথাও `max:100` বা `calculateGrade()` নেই — পূর্ণমান প্রতি পরীক্ষা-বিষয়ে আলাদা।

---

## 2. Fee Installment System (Pay in Installments)

### Database
```sql
CREATE TABLE fee_installment_plans (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    fee_category_id BIGINT UNSIGNED NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    installments INT NOT NULL DEFAULT 3,
    approved_by BIGINT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE fee_installments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    plan_id BIGINT UNSIGNED NOT NULL,
    institution_id BIGINT UNSIGNED NOT NULL,
    installment_no INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    due_date DATE NOT NULL,
    paid_at TIMESTAMP NULL,
    payment_id BIGINT UNSIGNED NULL,
    status ENUM('pending','paid','overdue') DEFAULT 'pending',
    FOREIGN KEY (plan_id) REFERENCES fee_installment_plans(id)
);
```

### API
```
POST /fees/installments/plan      → { student_id, due_key, installments } — Installment plan তৈরি
GET  /fees/installments/{planId}  → Plan detail ও installments
POST /fees/installments/{id}/pay  → নির্দিষ্ট installment পরিশোধ
GET  /fees/installments/overdue   → Overdue installments list
```

### Service Logic
```php
public function createPlan(int $studentId, string $dueKey, int $installments): void
{
    // Revision 7: a plan is made for ONE due line (key "{enrollment_id}:{fee_category_id}:{period}", from FeeService::dueLines()),
    // because a coaching student has several enrollments and each has its own amount.
    $line = app(FeeService::class)->dueLines(Student::findOrFail($studentId))->firstWhere('key', $dueKey)
        ?? throw new BusinessException('এই বকেয়ার জন্য কিস্তি করা যায় না', 'due_not_found');
    $categoryId  = $line['fee_category_id'];
    $totalAmount = $line['amount'];
    $perInstallment = round($totalAmount / $installments, 2);

    $plan = FeeInstallmentPlan::create([
        'student_id'      => $studentId,
        'fee_category_id' => $categoryId,
        'total_amount'    => $totalAmount,
        'installments'    => $installments,
        'institution_id'       => app('currentInstitution')->id,
    ]);

    for ($i = 1; $i <= $installments; $i++) {
        FeeInstallment::create([
            'plan_id'         => $plan->id,
            'institution_id'       => app('currentInstitution')->id,
            'installment_no'  => $i,
            'amount'          => $i === $installments
                                 ? $totalAmount - ($perInstallment * ($installments - 1))
                                 : $perInstallment, // last installment fixes rounding
            'due_date'        => now()->addMonths($i)->startOfMonth()->addDays(9),
            'status'          => 'pending',
        ]);
    }
}
```

---

## 3. Homework Submission (Student File Submit)

### Database
```sql
CREATE TABLE homework_submissions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    homework_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    file_path VARCHAR(500),
    text_answer TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    grade VARCHAR(10) NULL,
    teacher_feedback TEXT NULL,
    feedback_at TIMESTAMP NULL,
    status ENUM('submitted','late','graded') DEFAULT 'submitted',
    FOREIGN KEY (homework_id) REFERENCES homeworks(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    UNIQUE KEY unique_submission (homework_id, student_id)
);
```

### API
```
POST /homework/{id}/submit          → ছাত্র submission (file/text)
GET  /homework/{id}/submissions     → Teacher: সব submission দেখা
POST /homework/submissions/{id}/grade → Teacher: grade + feedback
GET  /student/homework/submitted    → ছাত্র: নিজের submissions
```

### Flow
```
Student → /student/homework → "Submit" বাটন
  → File upload (PDF/image) অথবা text answer
  → POST /homework/:id/submit
  → status: submitted (green) অথবা late (orange — after due_date)

Teacher → /teacher/homework → ক্লিক → submissions দেখা
  → প্রতিটি submission preview করা
  → Grade (A+/A/B) + feedback দেওয়া
  → Student notification পাঠানো
```

---

## 4. Online Exam / Quiz Module

### Database
```sql
CREATE TABLE online_exams (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    subject_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    duration_minutes INT NOT NULL DEFAULT 60,
    total_marks INT DEFAULT 100,
    pass_marks INT DEFAULT 33,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    shuffle_questions TINYINT(1) DEFAULT 1,
    show_result_instantly TINYINT(1) DEFAULT 0,
    status ENUM('draft','published','live','ended') DEFAULT 'draft',
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE exam_questions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    online_exam_id BIGINT UNSIGNED NOT NULL,
    question TEXT NOT NULL,
    type ENUM('mcq','true_false','short_answer') DEFAULT 'mcq',
    options JSON,          -- ["Option A","Option B","Option C","Option D"]
    correct_answer VARCHAR(255) NOT NULL,
    marks INT DEFAULT 1,
    explanation TEXT,
    FOREIGN KEY (online_exam_id) REFERENCES online_exams(id)
);

CREATE TABLE exam_attempts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    online_exam_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    answers JSON,          -- {"q_id": "answer", ...}
    score INT DEFAULT 0,
    percentage DECIMAL(5,2),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP NULL,
    time_taken_seconds INT,
    status ENUM('in_progress','submitted','graded') DEFAULT 'in_progress',
    UNIQUE KEY unique_attempt (online_exam_id, student_id),
    FOREIGN KEY (online_exam_id) REFERENCES online_exams(id)
);
```

### API
```
GET/POST /online-exams                     → List & create
POST /online-exams/{id}/publish            → Publish exam
GET  /online-exams/{id}/questions          → Question list (Teacher)
POST /online-exams/{id}/questions          → Add question
POST /online-exams/{id}/questions/bulk     → Bulk add questions
POST /online-exams/{id}/start              → Student: exam শুরু
POST /online-exams/{id}/submit             → Student: exam জমা
GET  /online-exams/{id}/results            → Teacher: সব results
GET  /online-exams/{id}/my-result          → Student: নিজের result
GET  /online-exams/{id}/leaderboard        → Result leaderboard
```

### Auto-grading (MCQ)
```php
public function gradeAttempt(ExamAttempt $attempt): int
{
    $questions = ExamQuestion::where('online_exam_id', $attempt->online_exam_id)->get();
    $answers   = $attempt->answers; // JSON decoded array
    $score     = 0;

    foreach ($questions as $q) {
        if (isset($answers[$q->id]) &&
            strtolower(trim($answers[$q->id])) === strtolower(trim($q->correct_answer))) {
            $score += $q->marks;
        }
    }

    $attempt->update([
        'score'      => $score,
        'percentage' => round(($score / $attempt->onlineExam->total_marks) * 100, 2),
        'status'     => 'graded',
        'submitted_at' => now(),
    ]);

    return $score;
}
```

---

## 5. Student Behavior & Discipline Log

### Database
```sql
CREATE TABLE behavior_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    reported_by BIGINT UNSIGNED NOT NULL,
    type ENUM('positive','negative','neutral') DEFAULT 'neutral',
    category VARCHAR(100),  -- 'discipline','academic','social','achievement'
    title VARCHAR(150) NOT NULL,
    description TEXT,
    action_taken TEXT,
    date DATE NOT NULL,
    parent_notified TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id)
);
```

### API
```
GET/POST /students/{id}/behavior    → Behavior log view & create
GET  /behavior/summary/{studentId}  → Behavior summary (positive vs negative)
POST /behavior/{id}/notify-parent   → Parent-কে SMS পাঠানো
```

### Use Cases
```
Positive: "Class debate-এ সেরা বক্তা", "Math Olympiad-এ ১ম স্থান"
Negative: "Class-এ মোবাইল ব্যবহার", "অনুপস্থিত ছিল explanation ছাড়া"
Action:   "Parents-কে ডাকা হয়েছে", "Warning letter দেওয়া হয়েছে"
```

---

## 6. Student Health Records

### Database
```sql
CREATE TABLE student_health_records (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    height_cm DECIMAL(5,1),
    weight_kg DECIMAL(5,1),
    blood_group VARCHAR(5),
    vision_left VARCHAR(20),
    vision_right VARCHAR(20),
    medical_conditions TEXT,    -- allergies, chronic conditions
    emergency_contact VARCHAR(100),
    emergency_phone VARCHAR(20),
    doctor_name VARCHAR(100),
    doctor_phone VARCHAR(20),
    last_checkup_date DATE,
    notes TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_health (student_id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);
```

### API
```
GET/PUT /students/{id}/health    → Health record view & update
GET /health/reports/{programId}    → Class-wise health summary
```

---

## 7. Certificate Generator

### Certificate Types
```
1. Participation Certificate  — events, competitions
2. Merit Certificate          — academic achievement
3. Appreciation Certificate   — extracurricular
4. Completion Certificate     — course/training
```

### Database
```sql
CREATE TABLE certificates (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    type ENUM('participation','merit','appreciation','completion') NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    issued_date DATE NOT NULL,
    issued_by BIGINT UNSIGNED NOT NULL,
    certificate_no VARCHAR(30) NOT NULL,         -- CERT-2025-00001; UNIQUE (institution_id, certificate_no) - per institution (D12), see schema.sql
    pdf_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### CertificateService.php
```php
public function generate(int $studentId, array $data): Certificate
{
    $certNo = 'CERT-' . date('Y') . '-' .
              str_pad(Certificate::whereYear('created_at', date('Y'))->count() + 1, 5, '0', STR_PAD_LEFT);

    $cert = Certificate::create([
        'student_id'     => $studentId,
        'certificate_no' => $certNo,
        'institution_id'      => app('currentInstitution')->id,
        'issued_date'    => now()->toDateString(),
        ...$data,
    ]);

    // PDF: ব্যক্তিগত তথ্য -> private disk, ছাত্রের নিচে (erasure এটিও মোছে) - docs/architecture/file-storage.md
    $pdf  = Pdf::loadView('pdf.certificate', compact('cert'))->setPaper('a4', 'landscape');
    $path = "institutions/{$cert->institution_id}/students/{$cert->student_id}/certificates/{$cert->certificate_no}.pdf";
    \Storage::disk('private')->put($path, $pdf->output());
    $cert->update(['pdf_path' => $path]);

    return $cert;
}
```

### API
```
GET/POST /certificates              → List & generate
GET /certificates/{id}/download     → PDF download
POST /certificates/bulk             → Bulk generate for class/event
```

---

## 8. Visitor Management Log

### Database
```sql
CREATE TABLE visitor_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    visitor_name VARCHAR(100) NOT NULL,
    visitor_phone VARCHAR(20),
    purpose VARCHAR(150) NOT NULL,
    whom_to_meet VARCHAR(100),
    department VARCHAR(100),
    id_type ENUM('nid','passport','driving_license','other') DEFAULT 'nid',
    id_number VARCHAR(50),
    check_in TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    check_out TIMESTAMP NULL,
    badge_no VARCHAR(20),
    photo VARCHAR(255),
    created_by BIGINT UNSIGNED NOT NULL
);
```

### API
```
POST /visitors/check-in      → Visitor check-in (photo optional)
PATCH /visitors/{id}/check-out → Check-out
GET  /visitors               → Today's visitor list
GET  /visitors/report        → Date range report
```

---

## 9. WhatsApp Notification Integration

### Overview
SMS-এর পাশাপাশি WhatsApp Business API দিয়ে message পাঠানো।
বাংলাদেশে WhatsApp ব্যবহার বাড়ছে — বিশেষত শহরে।

### Provider Options
```
1. Meta WhatsApp Business API (official, complex setup)
2. Twilio WhatsApp API (easy, higher cost)
3. WATI.io (BD-friendly, mid-cost)
4. Ultramsg.com (cheap, unofficial — risk)
```

### Database
```sql
-- users টেবিলে নতুন column
ALTER TABLE users ADD COLUMN whatsapp_number VARCHAR(20) NULL;
ALTER TABLE users ADD COLUMN whatsapp_enabled TINYINT(1) DEFAULT 0;

-- notification_preferences JSON-এ নতুন key
-- {"sms": true, "push": true, "whatsapp": true, "inapp": true}
```

### WhatsAppService.php (WATI.io)
```php
class WhatsAppService
{
    private string $baseUrl;
    private string $token;

    public function __construct()
    {
        $this->baseUrl = config('services.wati.endpoint');
        $this->token   = config('services.wati.token');
    }

    public function send(string $phone, string $template, array $params = []): bool
    {
        // Normalize BD phone: 01711111111 → +8801711111111
        $phone = '+880' . ltrim($phone, '0');

        $response = Http::withToken($this->token)
            ->post("{$this->baseUrl}/api/v1/sendTemplateMessage", [
                'template_name'   => $template,
                'broadcast_name'  => 'institution_notification',
                'receivers'       => [['whatsappNumber' => $phone]],
                'parameters'      => array_map(
                    fn($v) => ['name' => 'param', 'value' => $v],
                    $params
                ),
            ]);

        return $response->successful();
    }

    // Templates (pre-approved by Meta)
    public function sendAbsentAlert(Student $student): void
    {
        if (!$student->primaryParent?->whatsapp_enabled) return;
        $this->send(
            $student->guardian_phone,
            'student_absent_alert',  // pre-approved template name
            [$student->name, now()->format('d M Y'), app('currentInstitution')->name]
        );
    }

    public function sendFeeReminder(Student $student, float $amount): void
    {
        $this->send(
            $student->guardian_phone,
            'fee_due_reminder',
            [$student->name, "BDT {$amount}", app('currentInstitution')->name]
        );
    }
}
```

### .env
```
WATI_ENDPOINT=https://live-server.wati.io
WATI_TOKEN=your_wati_api_token
```

---

## 10. Fee Payment QR Code

### Overview
প্রতিটি ছাত্রের জন্য একটি unique QR code তৈরি হবে।
Accountant QR scan করলে সরাসরি সেই ছাত্রের ফি collection পেজ খুলবে।

### Implementation
```php
// composer require endroid/qr-code

use Endroid\QrCode\QrCode;
use Endroid\QrCode\Writer\PngWriter;

public function generateStudentQR(Student $student): string
{
    $url = url("/fees/collect?student_id={$student->id}&token=" .
                encrypt($student->id . '|' . $student->institution_id));

    $qrCode = QrCode::create($url)
        ->setSize(200)
        ->setMargin(10);

    $writer = new PngWriter();
    $result = $writer->write($qrCode);

    $path = "institutions/{$student->institution_id}/tmp/" . \Illuminate\Support\Str::uuid() . ".png";      // অস্থায়ী (files:prune-tmp)
    \Storage::disk('private')->put($path, $result->getString());

    return \Storage::disk('private')->temporaryUrl($path, now()->addHours(24));
}
```

### API
```
GET /students/{id}/qr-code          → QR code image URL
GET /students/qr-codes/bulk/{programId} → Class-wise bulk QR PDF
GET /fees/collect/scan?token=xxx    → QR scan → fee collection page
```

### React — QR Code Display
```jsx
// npm install qrcode.react
import { QRCodeSVG } from 'qrcode.react'

<QRCodeSVG
  value={`${baseUrl}/fees/collect/scan?token=${student.qr_token}`}
  size={150}
  level="H"
  includeMargin
/>
```

---

## 11. Bulk Fee Reminder with Custom SMS

### React UI
```jsx
// pages/accountant/BulkSmsReminder.jsx

const [filters, setFilters] = useState({ program_id: '', month: '' })
const [template, setTemplate] = useState(
  'Dear parent, {student_name} has an outstanding fee of BDT {amount} for {month}. Please pay by {due_date}.'
)
const [preview, setPreview] = useState([])

// Preview with real data before sending
const handlePreview = async () => {
  const res = await api.get('/fees/reminder/preview', { params: filters })
  setPreview(res.data.data)
}

// Available variables: {student_name} {amount} {month} {due_date} {institution_name}
```

### API
```
GET  /fees/reminder/preview         → Due students list with amounts
POST /fees/reminder/send            → Bulk SMS dispatch to Queue
GET  /fees/reminder/history         → Previous reminder logs
```

### BulkReminderService.php
```php
public function sendBulkReminder(array $filters, string $template): array
{
    $dues = $this->getDueStudents($filters);
    $sent = 0;

    foreach ($dues as $student) {
        $message = str_replace(
            ['{student_name}','{amount}','{month}','{due_date}','{institution_name}'],
            [$student->name, $student->due_amount, $filters['month'],
             Carbon::now()->endOfMonth()->format('d M Y'),
             app('currentInstitution')->name],
            $template
        );
        SendSmsJob::dispatch($student->guardian_phone, $message, app('currentInstitution')->id);
        $sent++;
    }

    return ['total_due' => $dues->count(), 'sms_sent' => $sent];
}
```

---

## 12. Report Card Email Delivery

### Overview
রেজাল্ট পাবলিশ হলে অভিভাবকের email-এ মার্কশিট PDF পাঠানো।

### Mail Class
```php
// app/Mail/MarksheetMail.php
class MarksheetMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Student $student,
        public string $pdfPath
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "{$this->student->name}-এর {$this->exam->name} ফলাফল",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.marksheet',
            with: [
                'studentName' => $this->student->name,
                'examName'    => $this->exam->name,
                'gpa'         => $this->summary->gpa,
                'institutionName'  => app('currentInstitution')->name,
            ],
        );
    }

    public function attachments(): array
    {
        return [
            Attachment::fromStorageDisk('s3', $this->pdfPath)
                      ->as("{$this->student->student_id}-marksheet.pdf")
                      ->withMime('application/pdf'),
        ];
    }
}
```

### Trigger on Result Publish
```php
// ExamService.php — inside publish() method
if ($institution->admin_email_enabled) {
    foreach ($students as $student) {
        $pdfPath = $this->pdfService->saveMarksheetToS3($student, $exam->id);
        Mail::to($student->primaryParent?->email)
            ->queue(new MarksheetMail($student, $pdfPath));
    }
}
```

---

## 13. Student ID Card Bulk Print

### Overview
পুরো ক্লাসের বা সব ছাত্রের ID card একটি PDF-এ bulk print।

### API
```
GET /students/id-cards/bulk?program_id=3&batch_id=5   → Bulk ID card PDF
```

### PdfService.php
```php
public function generateBulkIdCards(array $studentIds): string
{
    // 6 ID cards per A4 page (2 columns × 3 rows)
    $students = Student::with(['program','batch'])
                       ->whereIn('id', $studentIds)->get();

    $pdf = Pdf::loadView('pdf.bulk-id-cards', compact('students'))
              ->setPaper('a4');

    // প্রতিষ্ঠান-উপসর্গ + UUID: আগের "id-cards/bulk-<timestamp>.pdf" এ দুই প্রতিষ্ঠান একই সেকেন্ডে একে অন্যের ফাইল ঢেকে দিতে পারত
    $path = "institutions/" . app('currentInstitution')->id . "/tmp/" . \Illuminate\Support\Str::uuid() . ".pdf";
    \Storage::disk('private')->put($path, $pdf->output());
    return \Storage::disk('private')->temporaryUrl($path, now()->addHours(1));
}
```

### bulk-id-cards.blade.php layout
```html
{{-- A4 page, 2 col × 3 row = 6 cards per page --}}
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; padding: 8mm;">
  @foreach($students as $student)
    <div style="border: 1px solid #ccc; border-radius: 6px; padding: 8px; page-break-inside: avoid;">
      {{-- Institution logo, name, class, roll, photo, barcode --}}
    </div>
    @if($loop->index % 6 === 5 && !$loop->last)
      <div style="page-break-after: always;"></div>
    @endif
  @endforeach
</div>
```

---

## 14. Parent Meeting Scheduler

### Database
```sql
CREATE TABLE parent_meetings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    requested_by ENUM('parent','teacher','admin') DEFAULT 'teacher',
    subject VARCHAR(150) NOT NULL,
    proposed_date DATE NOT NULL,
    proposed_time TIME NOT NULL,
    location VARCHAR(100) DEFAULT 'School Office',
    status ENUM('pending','confirmed','cancelled','completed') DEFAULT 'pending',
    notes TEXT,
    parent_response_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id)
);
```

### API
```
POST /meetings/request          → Meeting request (teacher/admin)
PATCH /meetings/{id}/confirm    → Parent confirms
PATCH /meetings/{id}/cancel     → Cancel meeting
GET  /meetings/upcoming         → Upcoming meetings (teacher/admin)
GET  /parent/meetings           → Parent-এর upcoming meetings
```

### Notification Flow
```
Teacher creates meeting request
  → Parent gets SMS + In-App notification
  → Parent confirms/reschedules from parent panel
  → 1 day before: reminder SMS to parent
  → After meeting: Teacher marks as completed + notes
```

---

## 15. Multi-Branch Institution Support

### Overview
একই institution group-এর একাধিক campus/branch manage করা।

### Database
```sql
-- institutions টেবিলে নতুন column
ALTER TABLE institutions ADD COLUMN parent_institution_id BIGINT UNSIGNED NULL;
ALTER TABLE institutions ADD COLUMN branch_name VARCHAR(100) NULL;
ALTER TABLE institutions ADD COLUMN is_head_office TINYINT(1) DEFAULT 0;

-- Head office admin সব branches দেখতে পারবে
-- API: GET /super/institutions?parent_id=X → branches of institution X
```

### Cross-Branch Reports (Head Office Admin)
```php
// GET /admin/branches/report
public function crossBranchReport(): JsonResponse
{
    $parentInstitution = app('currentInstitution');
    $branches = Institution::where('parent_institution_id', $parentInstitution->id)
                      ->orWhere('id', $parentInstitution->id)
                      ->get();

    return response()->json([
        'branches' => $branches->map(fn($s) => [
            'name'            => $s->name,
            'total_students'  => Student::anyInstitution()
                                        ->where('institution_id', $s->id)->count(),
            'monthly_fee'     => FeePayment::anyInstitution()
                                           ->where('institution_id', $s->id)
                                           ->whereMonth('paid_at', now()->month)->sum('paid_amount'),
        ]),
    ]);
}
```

---

## 16. Alumni Module

### Database
```sql
CREATE TABLE alumni (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NULL,   -- original student record link
    name VARCHAR(100) NOT NULL,
    graduation_year YEAR NOT NULL,
    last_class VARCHAR(50),
    current_institution VARCHAR(150),
    current_profession VARCHAR(150),
    email VARCHAR(100),
    phone VARCHAR(20),
    address TEXT,
    achievements TEXT,
    profile_photo VARCHAR(255),
    is_verified TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### API
```
GET/POST  /alumni                  → Alumni list & register
GET       /alumni/{id}             → Alumni profile
PUT       /alumni/{id}             → Update profile (self)
GET       /alumni/directory        → Public directory (verified only)
GET       /alumni/stats            → Graduation year distribution
```

---

## 17. Two-Factor Authentication (2FA via OTP SMS)

### Database
```sql
CREATE TABLE otp_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    otp VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- users টেবিলে
ALTER TABLE users ADD COLUMN two_factor_enabled TINYINT(1) DEFAULT 0;
```

### Auth Flow with 2FA
```php
// LoginController.php
public function login(Request $request): JsonResponse
{
    // ... normal auth check ...

    if (auth()->user()->two_factor_enabled) {
        // Generate OTP and send SMS
        $otp = str_pad(rand(0, 999999), 6, '0', STR_PAD_LEFT);

        OtpToken::create([
            'user_id'    => auth()->id(),
            'otp'        => hash('sha256', $otp),
            'expires_at' => now()->addMinutes(5),
        ]);

        SendSmsJob::dispatch(auth()->user()->phone,
            "Your OTP: {$otp}. Valid for 5 minutes. -SchoolApp");

        Auth::logout(); // token এখন দেওয়া হবে না

        return response()->json([
            'success'    => false,
            'error'      => '2fa_required',
            'message'    => 'OTP sent to your phone',
            'phone_hint' => substr(auth()->user()->phone, 0, 4) . '****' .
                            substr(auth()->user()->phone, -2),
        ], 200);
    }

    $token = auth()->user()->createToken('auth_token')->plainTextToken;
    return response()->json(['success' => true, 'token' => $token]);
}

// POST /auth/verify-otp
public function verifyOtp(Request $request): JsonResponse
{
    $request->validate(['otp' => 'required|digits:6', 'user_id' => 'required']);

    $otpRecord = OtpToken::where('user_id', $request->user_id)
                         ->where('used_at', null)
                         ->where('expires_at', '>', now())
                         ->latest()->first();

    if (!$otpRecord || !hash_equals($otpRecord->otp, hash('sha256', $request->otp))) {
        return response()->json(['error' => 'invalid_otp', 'message' => 'Invalid or expired OTP'], 401);
    }

    $otpRecord->update(['used_at' => now()]);
    $user  = \App\Models\User::find($request->user_id);
    $token = $user->createToken('auth_token')->plainTextToken;

    return response()->json(['success' => true, 'token' => $token, 'user' => new UserResource($user)]);
}
```

---

## 18. Per-Institution API Rate Limiting

### Overview
প্রতিটি স্কুলের জন্য আলাদা rate limit — plan অনুযায়ী।

### Implementation
```php
// app/Http/Middleware/InstitutionRateLimit.php
class InstitutionRateLimit
{
    public function handle($request, Closure $next)
    {
        $institution    = app('currentInstitution');
        $plan      = $institution->subscriptionPlan;
        $rateLimit = match($plan?->name) {
            'Enterprise' => 300,  // 300 requests/min
            'Pro'        => 120,  // 120 requests/min
            default      => 60,   // 60 requests/min (Basic + Trial)
        };

        $key      = "rate_limit:institution:{$institution->id}";
        $attempts = \Cache::store('redis')->get($key, 0);

        if ($attempts >= $rateLimit) {
            return response()->json([
                'error'   => 'rate_limit_exceeded',
                'message' => "API rate limit: {$rateLimit} requests/minute",
                'retry_after' => 60,
            ], 429)->withHeaders([
                'X-RateLimit-Limit'     => $rateLimit,
                'X-RateLimit-Remaining' => 0,
                'Retry-After'           => 60,
            ]);
        }

        \Cache::store('redis')->increment($key);
        \Cache::store('redis')->expire($key, 60);

        return $next($request)->withHeaders([
            'X-RateLimit-Limit'     => $rateLimit,
            'X-RateLimit-Remaining' => $rateLimit - $attempts - 1,
        ]);
    }
}
```

---

## 19. Zoom API Auto-Create Meeting

### Overview
Teacher online class schedule করলে Zoom meeting স্বয়ংক্রিয় তৈরি হবে।

### ZoomService.php
```php
class ZoomService
{
    private string $baseUrl = 'https://api.zoom.us/v2';

    private function getToken(): string
    {
        // Server-to-Server OAuth (Zoom Apps Marketplace)
        return Cache::remember('zoom_token', 3500, function() {
            $response = Http::asForm()->post('https://zoom.us/oauth/token', [
                'grant_type'  => 'account_credentials',
                'account_id'  => config('services.zoom.account_id'),
            ])->withBasicAuth(
                config('services.zoom.client_id'),
                config('services.zoom.client_secret')
            );
            return $response->json('access_token');
        });
    }

    public function createMeeting(OnlineClass $class): array
    {
        $response = Http::withToken($this->getToken())
            ->post("{$this->baseUrl}/users/me/meetings", [
                'topic'      => $class->title,
                'type'       => 2, // scheduled meeting
                'start_time' => $class->scheduled_at->toIso8601String(),
                'duration'   => $class->duration_minutes,
                'timezone'   => 'Asia/Dhaka',
                'settings'   => [
                    'host_video'       => true,
                    'participant_video' => true,
                    'waiting_room'     => true,
                    'auto_recording'   => 'cloud',
                ],
            ]);

        return [
            'meeting_id'   => $response->json('id'),
            'join_url'     => $response->json('join_url'),
            'start_url'    => $response->json('start_url'),
            'password'     => $response->json('password'),
        ];
    }
}

// OnlineClassService.php — auto-called on create
$meeting = $this->zoomService->createMeeting($onlineClass);
$onlineClass->update([
    'meeting_id' => $meeting['meeting_id'],
    'meeting_link'=> $meeting['join_url'],
    'passcode'   => $meeting['password'],
    'teacher_start_url' => $meeting['start_url'],
]);
```

### .env
```
ZOOM_ACCOUNT_ID=your_account_id
ZOOM_CLIENT_ID=your_client_id
ZOOM_CLIENT_SECRET=your_client_secret
```
EOF

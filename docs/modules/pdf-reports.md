# PDF & Report System

## PDF Document List
| PDF | Endpoint | Size | Panel |
|-----|----------|------|---------|
| Marksheet | GET /results/marksheet/{id} | A4 | Admin, Student, Parent |
| Fee Receipt | GET /fees/receipt/{id} | A5 | Admin, Accountant, Parent |
| ID Card | GET /students/{id}/card | A6 | Admin |
| Salary Slip | GET /salary/{id}/slip | A5 | Accountant |
| Attendance Report | GET /attendance/report/pdf | A4 | Admin, Teacher, Parent |
| TC Certificate | POST /students/{id}/transfer | A4 | Admin |

## ⚠ PDF engine — ভাষা-ঝুঁকি (Revision 9)
বাংলা (যুক্তাক্ষর) ও আরবি (শেপিং + RTL + bidi) দুটোই *জটিল লিপি*। নিচের নমুনা `barryvdh/laravel-dompdf` ধরে; জটিল লিপিতে তার সীমাবদ্ধতার অভিযোগ প্রচলিত, কিন্তু আপনার সংস্করণে আমি **যাচাই করিনি**। Engine চূড়ান্ত করার আগে Spike S5c: একই রসিদ ও marksheet (বাংলা + আরবি + ইংরেজি, মিশ্র নাম) অন্তত দুই engine-এ পাশাপাশি। মানদণ্ড ও প্রার্থী: `docs/I18N.md` §৮। ফলের আগে PDF-এর ভাষা-বিন্যাস চূড়ান্ত নয়। PDF-এ `<html lang dir>` ও লিপি-উপযোগী ফন্ট embed বাধ্যতামূলক।

## PdfService.php
```php
use Barryvdh\DomPDF\Facade\Pdf;

public function generateMarksheet(Student $student, int $examId) {
    $results = Result::where('student_id', $student->id)
                     ->where('exam_id', $examId)->with('subject')->get();
    $gpa = round($results->avg('grade_point'), 2);
    $pdf = Pdf::loadView('pdf.marksheet', compact('student','results','gpa'))
              ->setPaper('a4');
    return $pdf->download("marksheet-{$student->student_id}.pdf");
}
```

## React Download (usePrint hook)
```javascript
const res = await axios.get(url, { params, responseType: 'blob' })
const blobUrl = URL.createObjectURL(res.data)
const link = document.createElement('a')
link.href = blobUrl; link.download = filename; link.click()
URL.revokeObjectURL(blobUrl)
```

## Excel Reports (Maatwebsite)
- StudentExport, FeeCollectionExport, DueListExport
- AttendanceExport, ResultExport, SalaryExport
```php
return Excel::download(new StudentExport(), 'students.xlsx');
```

---

## Excel Report Templates (Maatwebsite)

### StudentExport.php
```php
class StudentExport implements FromCollection, WithHeadings, WithStyles, WithColumnWidths {
    public function collection() {
        return Student::with(['program','batch'])
            ->get()->map(fn($s) => [
                $s->student_id, $s->name, $s->program->name,
                $s->batch?->name, $s->roll_no, $s->gender,
                $s->date_of_birth, $s->guardian_phone,
                $s->admission_date, $s->status,
            ]);
    }
    public function headings(): array {
        return ['আইডি','নাম','শ্রেণী','সেকশন','রোল','লিঙ্গ','জন্ম তারিখ','অভিভাবক ফোন','ভর্তির তারিখ','অবস্থা'];
    }
    public function styles(Worksheet $sheet) {
        return [1 => ['font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
                      'fill' => ['fillType' => Fill::FILL_SOLID, 'color' => ['rgb' => '185FA5']]]];
    }
}
```

### FeeCollectionExport.php
```php
// Columns: Receipt No, Date, Student Name, Class, Fee Category, Amount, Method, Collected By
// Filter: month, program_id, fee_category_id
// Summary row: Total collection
```

### AttendanceExport.php
```php
// Pivot format:
// Rows: Student Name, Roll
// Columns: 1, 2, 3...31 (days of month)
// Cells: P (Present), A (Absent), L (Late), H (Holiday)
// Last column: Attendance % 
```

## Marksheet Blade Template Layout
```
┌────────────────────────────────────────────┐
│  [LOGO]  School Name                       │
│          Address | Phone | Email           │
├────────────────────────────────────────────┤
│         MARKSHEET — Exam Name 2025         │
├───────────────┬────────────────────────────┤
│ Name:         │ Student ID:                │
│ Class:        │ Academic Year:             │
│ Roll:         │ Published Date:            │
├───────┬───────┬──────┬──────┬──────────────┤
│Subject│Full   │Marks │Grade │Grade Point   │
│       │Marks  │      │      │              │
├───────┼───────┼──────┼──────┼──────────────┤
│ Math  │  100  │  91  │ A+   │    5.00      │
│ ...   │       │      │      │              │
├───────┴───────┴──────┴──────┴──────────────┤
│ Total: 500   Obtained: 396   GPA: 4.10     │
│ Result: PASSED                             │
├─────────────┬──────────────┬───────────────┤
│Class Teacher│ Head Teacher │Parent Sign    │
└─────────────┴──────────────┴───────────────┘
```

## Report Pages (Admin)
- `/admin/reports/students` — ছাত্র রিপোর্ট (class, batch, status filter)
- `/admin/reports/attendance` — উপস্থিতি রিপোর্ট (month, class filter)
- `/admin/reports/fees` — ফি রিপোর্ট (month, class, category filter)
- `/admin/reports/results` — পরীক্ষার ফলাফল রিপোর্ট
- `/admin/reports/salary` — বেতন রিপোর্ট (month filter)
- `/accountant/reports` — আয়-ব্যয় বিবরণী, ব্যালেন্স শিট

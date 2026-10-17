# Excel Student Import Feature

> **SUPERSEDED (Revision 16) — endpoints, queue-নীতি ও লগ-টেবিল:** এই ফাইলের `/students/import/*` endpoint, `StudentController::importSync/importTemplate` এবং `student_import_logs` **বাতিল**। ছাত্র-আমদানি এখন সাধারণ আমদানি-উইজার্ডে (`docs/modules/data-migration.md`): `/imports` endpoint, `import_jobs`/`import_rows`, `kind=students`, dry-run বাধ্যতামূলক, রোলব্যাক। Release 1-এ `data_migration` মডিউল শুধু `kind=students`-এর জন্য চালু (`config('release.import_kinds')`)। **এই ফাইল এখনো কার্যকর:** সারি-যাচাইয়ের নিয়ম (program/batch/roll_no), Excel-টেমপ্লেটের কলাম, ছাত্র-ID বরাদ্দ ও `EnrollmentService` ব্যবহার।

> **Revision 6 note:** import-এর সময় `students` row-এ `program_id` / `batch_id` / `roll_no` সরাসরি লিখবেন না। `StudentImport::model()`-এ Student তৈরি করুন এই তিনটি field ছাড়া, তারপর `app(EnrollmentService::class)->enroll($student, Batch::find($row['batch_id']), ['roll_no' => $row['roll_no'] ?? null])` call করুন। Template-এর কলাম header ("Class", "Section") `term('program')`, `term('batch')` থেকে আসবে; private_batch-এ `program_id` কলাম থাকে না (default program)। coaching-এ একই student-কে একাধিক batch-এ দিতে `batch_id` কলামে কমা-বিভক্ত id গ্রহণ করুন। Student user-এর `username` = `student_id`, `phone` NULL। বিস্তারিত: `docs/modules/academic-structure.md`।

## Overview
Admin একটি Excel/CSV ফাইল আপলোড করে একসাথে অনেক ছাত্র ভর্তি করতে পারবেন।
Maatwebsite/Excel প্যাকেজ দিয়ে implement করা হবে।
500 students পর্যন্ত একটি file-এ import করা যাবে।

---

## Excel Template Format

### "Students" Sheet (main data)
```
| name*       | program_id* | batch_id | roll_no | date_of_birth | gender* | father_name | mother_name | guardian_phone* | address | admission_date |
|-------------|----------------|------------|---------|---------------|---------|-------------|-------------|-----------------|---------|----------------|
| Raju Ahmed  | 3              | 5          | 12      | 2010-05-15    | male    | Abdul Karim | Fatema      | 01711111111     | Dhaka   | 2025-01-01     |
```

### Required Fields (*)
- `name` — student name
- `program_id` — class ID (see "Class List" sheet in template)
- `gender` — must be exactly: male / female / other
- `guardian_phone` — guardian's phone number

### Auto-generated (do NOT fill)
- `student_id` — auto: DHA-2025-0001 format
- `admission_date` — defaults to today if left blank
- User account — created automatically, password = student_id

### Template Sheets
1. **Students** — fill student data here
2. **Class List** — reference: program_id vs class name
3. **Instructions** — step-by-step guide

---

## API Endpoints
```
GET  /students/import/template   → Download Excel template (.xlsx)
POST /students/import/sync       → Upload & import (up to 50 students, sync)
POST /students/import            → Upload & import (up to 500 students, via Queue)
GET  /students/import/logs       → Previous import history
```

---

## Laravel Implementation

### composer require
```bash
composer require maatwebsite/excel
# already required for Excel reports — no new install needed
```

### app/Imports/StudentImport.php
```php
<?php
namespace App\Imports;

use App\Models\{Student, User, Program};
use App\Services\StudentService;
use Maatwebsite\Excel\Concerns\{
    ToModel, WithHeadingRow, WithBatchInserts,
    WithChunkReading, WithValidation, SkipsOnError
};
use Maatwebsite\Excel\Concerns\SkipsErrors;
use Illuminate\Validation\Rule;

class StudentImport implements
    ToModel,
    WithHeadingRow,
    WithBatchInserts,
    WithChunkReading,
    WithValidation,
    SkipsOnError
{
    use SkipsErrors;

    public int $importedCount = 0;
    public array $failedRows  = [];

    public function __construct(
        private int $institutionId,
        private StudentService $studentService
    ) {}

    public function model(array $row): ?Student
    {
        // Revision 7: one transaction per row; the student is created WITHOUT program/batch/roll and enrolled through EnrollmentService
        // (students.program_id/batch_id/roll_no are a cache written only there - docs/modules/academic-structure.md).
        try {
            return DB::transaction(function () use ($row) {
                // The tenant is already bound: the import is dispatched as a TenantAwareJob (BindTenant middleware) - do NOT bind it here
                $batch = Batch::with('program')->findOrFail($row['batch_id']);                            // global scope => this institution only
                if (isset($row['program_id']) && (int) $row['program_id'] !== (int) $batch->program_id) {
                    throw new \RuntimeException('batch_id এই program-এর নয়');
                }

                $code = $this->studentService->generateStudentId();                                       // per-institution, locked (see StudentService)
                $name = trim($row['name']);

                // Student login = student ID (users.username). No fake e-mail, phone stays NULL (docs/AUTHORIZATION.md)
                $user = User::create([
                    'institution_id' => $this->institutionId, 'name' => $name, 'username' => $code, 'role' => 'student',
                    'password' => bcrypt($code), 'must_change_password' => 1,
                ]);
                $student = Student::create([
                    'institution_id' => $this->institutionId, 'user_id' => $user->id, 'student_id' => $code,
                    'date_of_birth' => $row['date_of_birth'] ?? null, 'gender' => strtolower($row['gender']),
                    'father_name' => $row['father_name'] ?? null, 'mother_name' => $row['mother_name'] ?? null,
                    'guardian_phone' => normalize_bd_phone($row['guardian_phone']), 'address' => $row['address'] ?? null,
                    'admission_date' => $row['admission_date'] ?? now()->toDateString(), 'status' => 'active',
                ]);

                // coaching: batch_id may be a comma-separated list - several batches at once; the first becomes the primary enrollment
                foreach (array_filter(array_map('trim', explode(',', (string) $row['batch_id']))) as $i => $bid) {
                    app(EnrollmentService::class)->enroll($student, Batch::findOrFail($bid), $i === 0 ? ['roll_no' => $row['roll_no'] ?? null] : []);
                }

                // Parent account only when the institution type has a parent role AND the portal is on (see docs/modules/fees-advanced.md linkParent)
                $this->studentService->linkParent($student->id, ['guardian_phone' => $row['guardian_phone'], 'father_name' => $row['father_name'] ?? 'Guardian']);

                $this->importedCount++;
                return $student;
            });
        } catch (\Throwable $e) {
            $this->failedRows[] = ['row' => $row['name'] ?? 'Unknown', 'error' => $e->getMessage()];
            return null;
        }
    }

    public function rules(): array
    {
        return [
            'name'           => ['required', 'string', 'max:100'],
            'batch_id'       => ['required', 'string'],            // one id, or ids separated by commas (coaching: several batches)
            'program_id'     => ['nullable', 'integer'],           // optional cross-check only; the batch decides the program
            'gender'         => ['required', Rule::in(['male','female','other'])],
            'guardian_phone' => ['required', 'string', 'max:20'],
            'date_of_birth'  => ['nullable', 'date'],
            'roll_no'        => ['nullable', 'integer', 'min:1'],
            'admission_date' => ['nullable', 'date'],
        ];
    }

    public function customValidationMessages(): array
    {
        return [
            'name.required'           => 'Row :attribute: Name is required',
            'batch_id.required'       => 'Row :attribute: ' . term('batch') . ' ID is required',
            'guardian_phone.required' => 'Row :attribute: Guardian phone is required',
            'gender.in'               => 'Row :attribute: Gender must be male/female/other',
        ];
    }

    public function batchSize(): int { return 100; }
    public function chunkSize(): int { return 200; }
}
```

### app/Exports/StudentImportTemplate.php
```php
<?php
namespace App\Exports;

use App\Models\{Program, Batch};
use Maatwebsite\Excel\Concerns\{
    WithMultipleSheets, FromArray,
    WithHeadings, WithStyles, WithColumnWidths, WithTitle
};
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;

class StudentImportTemplate implements WithMultipleSheets
{
    public function sheets(): array
    {
        return [
            new StudentsSheet(),
            new ClassListSheet(),
            new InstructionsSheet(),
        ];
    }
}

// ── Sheet 1: Students Data ────────────────────────────────────────
class StudentsSheet implements FromArray, WithHeadings, WithStyles, WithColumnWidths, WithTitle
{
    public function title(): string { return 'Students'; }

    public function headings(): array
    {
        return [
            'name*', 'program_id*', 'batch_id',
            'roll_no', 'date_of_birth', 'gender*',
            'father_name', 'mother_name', 'guardian_phone*',
            'address', 'admission_date',
        ];
    }

    public function array(): array
    {
        // Sample row
        return [
            ['Raju Ahmed', 3, 5, 12, '2010-05-15', 'male',
             'Abdul Karim', 'Fatema Begum', '01711111111', 'Dhaka', '2025-01-01'],
        ];
    }

    public function columnWidths(): array
    {
        return [
            'A'=>22, 'B'=>16, 'C'=>12, 'D'=>10,
            'E'=>16, 'F'=>10, 'G'=>22, 'H'=>22,
            'I'=>18, 'J'=>28, 'K'=>16,
        ];
    }

    public function styles(Worksheet $sheet): array
    {
        return [
            1 => [
                'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
                'fill' => [
                    'fillType'   => Fill::FILL_SOLID,
                    'startColor' => ['rgb' => '185FA5'],
                ],
            ],
        ];
    }
}

// ── Sheet 2: Class List Reference ────────────────────────────────
class ClassListSheet implements FromArray, WithHeadings, WithTitle
{
    public function title(): string { return 'Class List'; }

    public function headings(): array
    {
        return ['program_id', 'program_name', 'batch_id', 'batch_name'];
    }

    public function array(): array
    {
        $rows = [];
        $classes = Program::with('batches')->get();
        foreach ($classes as $class) {
            if ($class->batches->isEmpty()) {
                $rows[] = [$class->id, $class->name, '', ''];
            } else {
                foreach ($class->batches as $batch) {
                    $rows[] = [$class->id, $class->name, $batch->id, $batch->name];
                }
            }
        }
        return $rows;
    }
}

// ── Sheet 3: Instructions ─────────────────────────────────────────
class InstructionsSheet implements FromArray, WithTitle
{
    public function title(): string { return 'Instructions'; }

    public function array(): array
    {
        return [
            ['STUDENT BULK IMPORT — INSTRUCTIONS'],
            [''],
            ['STEP 1: Fill in the "Students" sheet with your student data.'],
            ['STEP 2: Use program_id and batch_id from the "Class List" sheet.'],
            ['STEP 3: Upload this file in Admin → Students → Excel Import.'],
            [''],
            ['REQUIRED COLUMNS (marked with *):'],
            ['  name*          — Student full name'],
            ['  program_id* — Use ID from "Class List" sheet'],
            ['  gender*        — Must be exactly: male / female / other'],
            ['  guardian_phone*— 11-digit BD mobile number'],
            [''],
            ['OPTIONAL COLUMNS:'],
            ['  batch_id     — Use ID from "Class List" sheet'],
            ['  roll_no        — Numeric roll number'],
            ['  date_of_birth  — Format: YYYY-MM-DD (e.g., 2010-05-15)'],
            ['  father_name    — Father name'],
            ['  mother_name    — Mother name'],
            ['  address        — Home address'],
            ['  admission_date — Format: YYYY-MM-DD (default: today)'],
            [''],
            ['AUTO-GENERATED (leave these blank):'],
            ['  student_id     — Auto: DHA-2025-0001 format'],
            ['  User account   — Created automatically'],
            ['  Password       — Auto-generated student_id'],
            [''],
            ['LIMITS:'],
            ['  Max 500 students per file'],
            ['  File size max: 5 MB'],
            ['  Accepted formats: .xlsx, .xls, .csv'],
            [''],
            ['NOTES:'],
            ['  - Do NOT change column headers in row 1'],
            ['  - Delete this sample row before uploading'],
            ['  - Duplicate guardian_phone will be linked to same parent account'],
        ];
    }
}
```

### Controller Methods
```php
// app/Http/Controllers/Admin/StudentController.php

use App\Imports\StudentImport;
use App\Exports\StudentImportTemplate;
use Maatwebsite\Excel\Facades\Excel;
use Maatwebsite\Excel\Validators\ValidationException;

// Template download
public function importTemplate(): BinaryFileResponse
{
    return Excel::download(
        new StudentImportTemplate(),
        'student-import-template.xlsx'
    );
}

// Sync import (up to ~50 students, instant result)
public function importSync(Request $request): JsonResponse
{
    $request->validate([
        'file' => 'required|file|mimes:xlsx,xls,csv|max:2048', // 2MB
    ]);

    $institution  = app('currentInstitution');
    $service = app(\App\Services\StudentService::class);
    $import  = new StudentImport($institution->id, $service);

    try {
        Excel::import($import, $request->file('file'));

        // Import log kayda
        \App\Models\StudentImportLog::create([
            'institution_id'      => $institution->id,
            'imported_by'    => auth()->id(),
            'filename'       => $request->file('file')->getClientOriginalName(),
            'imported_count' => $import->importedCount,
            'failed_count'   => count($import->failedRows),
            'status'         => 'completed',
            'error_log'      => $import->failedRows ?: null,
        ]);

        // Cache clear (dashboard stats update)
        \Illuminate\Support\Facades\Cache::forget("dashboard:{$institution->id}");

        return response()->json([
            'success' => true,
            'message' => "{$import->importedCount} students imported successfully",
            'data'    => [
                'imported' => $import->importedCount,
                'failed'   => count($import->failedRows),
                'errors'   => $import->failedRows,
            ],
        ]);

    } catch (ValidationException $e) {
        $failures = collect($e->failures())->map(fn($f) => [
            'row'    => $f->row(),
            'column' => $f->attribute(),
            'errors' => $f->errors(),
            'value'  => $f->values()[$f->attribute()] ?? '',
        ]);

        return response()->json([
            'success'  => false,
            'error'    => 'validation_failed',
            'message'  => 'Some rows have validation errors. Fix and re-upload.',
            'failures' => $failures,
        ], 422);
    }
}

// Queue import (up to 500 students, background job)
public function import(Request $request): JsonResponse
{
    $request->validate([
        'file' => 'required|file|mimes:xlsx,xls,csv|max:5120', // 5MB
    ]);

    $institution  = app('currentInstitution');
    $service = app(\App\Services\StudentService::class);

    $log = \App\Models\StudentImportLog::create([
        'institution_id'   => $institution->id,
        'imported_by' => auth()->id(),
        'filename'    => $request->file('file')->getClientOriginalName(),
        'status'      => 'pending',
    ]);

    Excel::queueImport(
        new StudentImport($institution->id, $service),
        $request->file('file')
    )->chain([
        new \App\Jobs\MarkImportComplete($log->id, auth()->id()),
    ]);

    return response()->json([
        'success' => true,
        'message' => 'Import started. You will be notified when complete.',
        'log_id'  => $log->id,
    ]);
}

// Import history
public function importLogs(): JsonResponse
{
    $logs = \App\Models\StudentImportLog::latest()
        ->take(10)
        ->get(['id','filename','imported_count','failed_count','status','created_at']);

    return response()->json(['success' => true, 'data' => $logs]);
}
```

### Add Routes
```php
// routes/api.php — inside Admin middleware group
Route::get('/students/import/template', [StudentController::class, 'importTemplate']);
Route::post('/students/import/sync',    [StudentController::class, 'importSync']);
Route::post('/students/import',         [StudentController::class, 'import']);
Route::get('/students/import/logs',     [StudentController::class, 'importLogs']);
```

---

## React Frontend

### pages/admin/students/StudentImport.jsx
```jsx
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../api/axios'
import { useUiStore } from '../../../store/uiStore'
import PageHeader from '../../../components/common/PageHeader'
import { useNavigate } from 'react-router-dom'

const downloadTemplate = () =>
  api.get('/students/import/template', { responseType: 'blob' })
     .then(res => {
       const url = URL.createObjectURL(new Blob([res.data]))
       const a = document.createElement('a')
       a.href = url; a.download = 'student-import-template.xlsx'; a.click()
       URL.revokeObjectURL(url)
     })

export default function StudentImport() {
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [failures, setFailures] = useState([])
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef()
  const navigate = useNavigate()
  const { addToast } = useUiStore()
  const queryClient = useQueryClient()

  // Import history
  const { data: logs } = useQuery({
    queryKey: ['import-logs'],
    queryFn: () => api.get('/students/import/logs').then(r => r.data.data),
  })

  const importMutation = useMutation({
    mutationFn: (formData) =>
      api.post('/students/import/sync', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      }),
    onSuccess: (res) => {
      setResult(res.data.data)
      setFailures([])
      queryClient.invalidateQueries({ queryKey: ['students'] })
      queryClient.invalidateQueries({ queryKey: ['import-logs'] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
      addToast(`${res.data.data.imported} students imported successfully`, 'success')
    },
    onError: (err) => {
      if (err.response?.data?.failures) {
        setFailures(err.response.data.failures)
        addToast(`Validation errors in ${err.response.data.failures.length} rows`, 'error')
      } else {
        addToast('Import failed. Please try again.', 'error')
      }
    },
  })

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && /\.(xlsx|xls|csv)$/i.test(f.name)) {
      setFile(f); setResult(null); setFailures([])
    } else {
      addToast('Only .xlsx, .xls, .csv files accepted', 'warning')
    }
  }

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    if (f) { setFile(f); setResult(null); setFailures([]) }
  }

  const handleSubmit = () => {
    if (!file) { addToast('Please select a file first', 'warning'); return }
    const fd = new FormData()
    fd.append('file', file)
    importMutation.mutate(fd)
  }

  const reset = () => {
    setFile(null); setResult(null); setFailures([])
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader
        title="Excel Student Import"
        breadcrumbs={[
          { label: 'Dashboard', path: '/admin' },
          { label: 'Students', path: '/admin/students' },
          { label: 'Excel Import' },
        ]}
      />

      {/* ── Step 1: Template ── */}
      <div className="bg-surface rounded-token border border-line p-density">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center
                          justify-center font-bold text-sm flex-shrink-0">1</div>
          <div className="flex-1">
            <h2 className="font-semibold text-content mb-1">Download Template</h2>
            <p className="text-sm text-content-muted mb-3">
              Download the Excel template, fill in student data, then upload below.
              The template includes a Class List sheet for reference.
            </p>
            <button
              onClick={downloadTemplate}
              className="bg-green-600 text-on-primary px-4 py-2 text-sm
                         font-medium hover:bg-green-700 flex items-center gap-2"
            >
              📥 Download Template (.xlsx)
            </button>
          </div>
        </div>
      </div>

      {/* ── Step 2: Upload ── */}
      <div className="bg-surface border p-density">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center
                          justify-center font-bold text-sm flex-shrink-0">2</div>
          <div className="flex-1">
            <h2 className="font-semibold text-content mb-3">Upload Filled File</h2>

            {/* Drop zone */}
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed p-8 text-center cursor-pointer
                         transition-colors ${dragging
                           ? 'border-primary bg-primary-soft'
                           : file
                             ? 'border-green-400 bg-green-50'
                             : 'border-line hover:border-primary hover:bg-surface-muted'
                         }`}
            >
              {file ? (
                <div>
                  <p className="text-3xl mb-2">📊</p>
                  <p className="font-medium text-content">{file.name}</p>
                  <p className="text-xs text-content-muted mt-1">
                    {(file.size / 1024).toFixed(1)} KB — Click to change
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-3xl mb-2">📁</p>
                  <p className="text-sm text-content-muted font-medium">
                    Drag & drop Excel file here or click to browse
                  </p>
                  <p className="text-xs text-content-muted mt-1">
                    .xlsx, .xls, .csv — Max 2MB (sync) / 5MB (queue)
                  </p>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Action buttons */}
            {file && (
              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleSubmit}
                  disabled={importMutation.isPending}
                  className="bg-primary text-on-primary px-5 py-2 rounded-token text-sm
                             font-medium hover:opacity-90 disabled:opacity-50
                             flex items-center gap-2"
                >
                  {importMutation.isPending
                    ? <><span className="animate-spin">⏳</span> Importing...</>
                    : '🚀 Start Import'}
                </button>
                <button
                  onClick={reset}
                  className="border border-line text-content-muted px-4 py-2
                             rounded-token text-sm hover:bg-surface-muted"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Result ── */}
      {result && (
        <div className="bg-surface border border-green-300 p-density">
          <h2 className="font-semibold text-green-700 mb-4">✅ Import Complete</h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Successfully Imported', value: result.imported, color: 'green' },
              { label: 'Failed Rows', value: result.failed, color: 'red' },
              { label: 'Total Processed', value: result.imported + result.failed, color: 'blue' },
            ].map(({ label, value, color }) => (
              <div key={label}
                className={`bg-${color}-50 border border-${color}-200
                            rounded-token p-3 text-center`}
              >
                <p className={`text-2xl font-bold text-${color}-600`}>{value}</p>
                <p className="text-xs text-content-muted mt-1">{label}</p>
              </div>
            ))}
          </div>

          {result.errors?.length > 0 && (
            <div>
              <p className="text-sm font-medium text-red-600 mb-2">
                Failed rows:
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <div key={i}
                    className="text-xs bg-red-50 border border-red-100
                               rounded p-2 text-red-600"
                  >
                    <b>{e.row}:</b> {e.error}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => navigate('/admin/students')}
              className="bg-primary text-on-primary px-4 py-2 rounded-token text-sm font-medium"
            >
              View Student List →
            </button>
            <button onClick={reset}
              className="border border-line text-content-muted px-4 py-2
                         text-sm">
              Import Another File
            </button>
          </div>
        </div>
      )}

      {/* ── Validation Errors ── */}
      {failures.length > 0 && (
        <div className="bg-surface border border-red-300 p-density">
          <h2 className="font-semibold text-red-700 mb-3">
            ❌ Validation Errors ({failures.length} rows)
          </h2>
          <p className="text-sm text-content-muted mb-3">
            Fix these errors in your Excel file and re-upload.
          </p>
          <div className="overflow-x-auto border border-line">
            <table className="w-full text-xs">
              <thead className="bg-red-50">
                <tr>
                  {['Row #', 'Column', 'Error', 'Your Value'].map(h => (
                    <th key={h} className="p-2 text-start font-semibold text-red-700">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {failures.map((f, i) => (
                  <tr key={i} className="hover:bg-red-50">
                    <td className="p-2 font-mono text-content-muted">{f.row}</td>
                    <td className="p-2 text-content-muted">{f.column}</td>
                    <td className="p-2 text-red-600">{f.errors.join(', ')}</td>
                    <td className="p-2 font-mono text-content-muted">
                      {String(f.value ?? '(empty)')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Rules ── */}
      <div className="bg-primary-soft border border-primary rounded-token p-5">
        <h3 className="font-semibold text-primary-fg mb-2">📋 Import Rules</h3>
        <ul className="text-sm text-primary-fg space-y-1">
          <li>• Required: <b>name, program_id, gender, guardian_phone</b></li>
          <li>• Use program_id from the "Class List" sheet in the template</li>
          <li>• gender must be exactly: <b>male</b> / <b>female</b> / <b>other</b></li>
          <li>• date_of_birth format: <b>YYYY-MM-DD</b> (e.g. 2010-05-15)</li>
          <li>• student_id is auto-generated — leave blank</li>
          <li>• Default password = auto-generated student_id</li>
          <li>• Same guardian_phone → students linked to one parent account</li>
          <li>• Max <b>50 students</b> per file for instant result | <b>500</b> via queue</li>
          <li>• Do NOT modify column headers in row 1 of the template</li>
        </ul>
      </div>

      {/* ── Import History ── */}
      {logs?.length > 0 && (
        <div className="bg-surface border border-line p-density">
          <h3 className="font-semibold text-content mb-3">📜 Import History</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-content-muted border-b border-line">
                {['File', 'Imported', 'Failed', 'Status', 'Date'].map(h => (
                  <th key={h} className="pb-2 text-start font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logs.map(log => (
                <tr key={log.id}>
                  <td className="py-2 text-content text-xs">{log.filename}</td>
                  <td className="py-2 text-green-600 font-medium">{log.imported_count}</td>
                  <td className="py-2 text-red-500">{log.failed_count}</td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      log.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="py-2 text-content-muted text-xs">{log.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

---

## Database — Import Log Table
```sql
CREATE TABLE student_import_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    imported_by BIGINT UNSIGNED NOT NULL,
    filename VARCHAR(255) NOT NULL,
    total_rows INT DEFAULT 0,
    imported_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    status ENUM('pending','processing','completed','failed') DEFAULT 'pending',
    error_log JSON NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
```

## Router — Add Entry
```javascript
// src/router/index.jsx — inside Admin routes
{
  path: 'students/import',
  element: S(lazy(() => import('../pages/admin/students/StudentImport')))
}
```

## Import Button on Student List Page
```jsx
// StudentList.jsx — inside PageHeader actions
<div className="flex gap-2">
  <button
    onClick={() => navigate('/admin/students/import')}
    className="border border-primary text-primary-fg px-4 py-2 rounded-token text-sm
               font-medium hover:bg-primary-soft flex items-center gap-1"
  >
    📊 Excel Import
  </button>
  <button
    onClick={() => navigate('/admin/students/add')}
    className="bg-primary text-on-primary px-4 py-2 rounded-token text-sm font-medium"
  >
    + Enroll Student
  </button>
</div>
```
EOF

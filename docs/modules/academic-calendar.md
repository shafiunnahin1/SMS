# Academic Calendar, Holiday & Exam Seating

## Academic Year Management

### Why Is This Needed?
- প্রতিটি শিক্ষাবর্ষে নতুন attendance, result শুরু হয়
- বছর পরিবর্তনে পুরোনো ডেটা archive হয়
- Promotion বছর শেষে হয়

### API
```
GET/POST /academic-years          → বছর তালিকা ও তৈরি
PATCH /academic-years/{id}/set-current → বর্তমান বছর নির্ধারণ
```

### AcademicYearService.php
```php
public function setCurrentYear(int $yearId): void {
    // Set previous current year to false
    AcademicYear::where('institution_id', app('currentInstitution')->id)
                ->update(['is_current' => false]);
    AcademicYear::findOrFail($yearId)->update(['is_current' => true]);
    // Cache clear
    Cache::forget("current_year:" . app('currentInstitution')->id);
}

public function getCurrentYear(): AcademicYear {
    return Cache::remember("current_year:" . app('currentInstitution')->id, 3600,
        fn() => AcademicYear::where('is_current', true)->firstOrFail()
    );
}
```

## Holiday Management

### API
```
GET  /holidays?month=2025-03    → মাসভিত্তিক ছুটির তালিকা
POST /holidays                  → নতুন ছুটি যোগ
PUT  /holidays/{id}             → ছুটি সম্পাদনা
DELETE /holidays/{id}           → ছুটি মুছে ফেলা
GET  /holidays/calendar         → পুরো বছরের ক্যালেন্ডার
```

### Holiday Integration with Attendance
```php
// Check holiday when taking attendance
public function isHoliday(string $date): bool {
    return Holiday::where('date', $date)->exists();
}

// Show warning if attendance is taken on a holiday
// Holiday days show as 'H' in monthly report
```

### React Calendar Component
```jsx
// Admin > Academic > Calendar page
// FullCalendar library or custom grid
// Holiday: red color
// Exam: blue color
// Events: green color
// Weekend (Friday): gray
```

## Exam Seat Plan (Seating Arrangement)

### Flow
```
Admin → Exam detail → "আসনবিন্যাস তৈরি করুন"
  → Room সংখ্যা input (e.g., 3 rooms)
  → প্রতিটি room-এ কতটি seat? (e.g., 30)
  → "Auto Generate" বাটন
    → System স্বয়ংক্রিয় ছাত্র বসায়
    → Roll order অনুযায়ী বিতরণ
  → Manual adjust করা যাবে (drag/drop)
  → Print → PDF (room-wise list)
```

### SeatingService.php
```php
public function autoAssign(int $examId, array $rooms): void {
    // rooms: [{ name: 'Room 1', capacity: 30 }, ...]
    $students = Student::whereHas('results', fn($q) =>
        $q->where('exam_id', $examId)
    )->orderBy('roll_no')->get();

    $seatNumber = 1;
    $roomIndex  = 0;

    foreach ($students as $student) {
        if ($seatNumber > $rooms[$roomIndex]['capacity']) {
            $seatNumber = 1;
            $roomIndex++;
        }
        ExamSeatPlan::create([
            'exam_id'     => $examId,
            'student_id'  => $student->id,
            'room_name'   => $rooms[$roomIndex]['name'],
            'seat_number' => $seatNumber,
            'institution_id'   => app('currentInstitution')->id,
        ]);
        $seatNumber++;
    }
}
```

## Student Documents

### Document Types
```php
const DOCUMENT_TYPES = [
    'birth_certificate'   => 'জন্ম নিবন্ধন সনদ',
    'national_id'         => 'জাতীয় পরিচয়পত্র (অভিভাবক)',
    'previous_marksheet'  => 'পূর্ববর্তী মার্কশিট',
    'passport_photo'      => 'পাসপোর্ট সাইজ ছবি',
    'transfer_certificate'=> 'ট্রান্সফার সার্টিফিকেট',
    'medical_certificate' => 'মেডিকেল সার্টিফিকেট',
    'other'               => 'অন্যান্য',
];
```

### S3 Path Strategy
```
students/photos/{institution_id}/{student_id}/profile.jpg
students/documents/{institution_id}/{student_id}/{type}/{uuid}.pdf
teachers/photos/{institution_id}/{teacher_id}/profile.jpg
reports/marksheets/{institution_id}/{exam_id}/{student_id}.pdf
reports/receipts/{institution_id}/{year}/{month}/{receipt_no}.pdf
invoices/{institution_id}/{invoice_number}.pdf
```

### API
```
GET    /students/{id}/documents        → সব ডকুমেন্ট লিস্ট
POST   /students/{id}/documents        → ডকুমেন্ট আপলোড (multipart)
DELETE /students/{id}/documents/{docId}→ ডকুমেন্ট মুছে ফেলা
GET    /students/{id}/documents/{docId}/download → ডাউনলোড (S3 signed URL)
```

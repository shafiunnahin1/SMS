# Online Class Module

## Database Tables
```sql
CREATE TABLE online_classes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    subject_id BIGINT UNSIGNED,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    platform ENUM('zoom','google_meet','jitsi','custom') DEFAULT 'google_meet',
    meeting_link VARCHAR(500) NOT NULL,
    meeting_id VARCHAR(100),
    passcode VARCHAR(50),
    scheduled_at TIMESTAMP NOT NULL,
    duration_minutes INT DEFAULT 60,
    status ENUM('scheduled','live','completed','cancelled') DEFAULT 'scheduled',
    recording_url VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id),
    FOREIGN KEY (program_id) REFERENCES programs(id)
);

CREATE TABLE class_materials (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    subject_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    type ENUM('pdf','video','link','image','other') DEFAULT 'pdf',
    file_path VARCHAR(500),
    external_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | /online-classes | ক্লাস তালিকা ও তৈরি |
| PUT | /online-classes/{id} | ক্লাস আপডেট |
| DELETE | /online-classes/{id} | ক্লাস বাতিল |
| PATCH | /online-classes/{id}/complete | সম্পন্ন মার্ক করা |
| GET/POST | /materials | স্টাডি মেটেরিয়াল |
| DELETE | /materials/{id} | মেটেরিয়াল মুছে ফেলা |

## Pages
- `/teacher/online-class` — ক্লাস তৈরি ও সময়সূচি
- `/student/materials` — বিষয়ভিত্তিক মেটেরিয়াল
- `/student/routine` — অনলাইন ক্লাসের সময়সূচিও এখানে

## Flow
```
Teacher → /teacher/online-class
  → "নতুন ক্লাস" বাটন
  → Zoom/Meet লিংক, তারিখ-সময়, বিষয় ফর্ম
  → POST /api/online-classes
  → In-App + Push notification → সব ছাত্র ও অভিভাবক
  → নির্ধারিত সময়ে ছাত্ররা লিংকে যোগ দেয়
  → ক্লাস শেষে recording URL আপলোড (optional)
  → ছাত্ররা recording দেখতে পারে যেকোনো সময়
```

---

## OnlineClassService.php
```php
class OnlineClassService
{
    public function create(array $data): OnlineClass
    {
        $class = OnlineClass::create([...$data, 'institution_id' => app('currentInstitution')->id]);

        // Auto-create Zoom meeting (if Zoom enabled)
        if (config('services.zoom.enabled')) {
            $meeting = app(ZoomService::class)->createMeeting($class);
            $class->update([
                'meeting_id'        => $meeting['meeting_id'],
                'meeting_link'      => $meeting['join_url'],
                'passcode'          => $meeting['password'],
            ]);
        }

        // Notify all students of this class
        $students = isset($data['batch_id'])
    ? Student::inBatch($data['batch_id'])->active()->get()                     // targeting rule: a batch
    : Student::inProgram($data['program_id'])->active()->get();                // or the whole program (docs/modules/academic-structure.md "Targeting Rule")
        foreach ($students as $student) {
            $student->user?->notify(new OnlineClassScheduled($class));
        }

        return $class;
    }

    public function getUpcoming(int $programId): Collection
    {
        return OnlineClass::where('program_id', $programId)
                          ->where('scheduled_at', '>', now())
                          ->where('status', 'scheduled')
                          ->with(['teacher.user', 'subject'])
                          ->orderBy('scheduled_at')
                          ->take(5)
                          ->get();
    }
}
```

## Integration with Student Routine Page
```jsx
// Online classes will also show in the student's routine
// Color coding:
// Blue  → Regular class (routine)
// Green → Online class (joinable)
// Gray  → Past class (recording available)

{upcomingOnlineClasses.map(cls => (
  <div key={cls.id} className="bg-green-50 border border-green-200 rounded-token p-3">
    <p className="font-medium">{cls.title}</p>
    <p className="text-sm text-content-muted">{cls.subject.name} • {cls.teacher.user.name}</p>
    <p className="text-sm">{formatDateTime(cls.scheduled_at)} • {cls.duration_minutes} min</p>
    <a href={cls.meeting_link} target="_blank"
       className="mt-2 inline-block bg-green-600 text-white px-3 py-1 rounded text-sm">
      Join Class →
    </a>
    {cls.recording_url && (
      <a href={cls.recording_url} target="_blank"
         className="ms-2 text-primary-fg text-sm underline">Watch Recording</a>
    )}
  </div>
))}
```

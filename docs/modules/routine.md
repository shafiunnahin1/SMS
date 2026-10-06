# Class Routine Builder

## Database (routines table — already in schema)
```
routines: institution_id, program_id, batch_id, subject_id, teacher_id,
          day_of_week, start_time, end_time, room_no
```

## Conflict Detection Logic
```php
// Services/RoutineService.php
public function checkConflict(array $data): array {
    $conflicts = [];

    // 1. Same teacher in two places at the same time?
    $teacherConflict = Routine::where('teacher_id', $data['teacher_id'])
        ->where('day_of_week', $data['day_of_week'])
        ->where(function($q) use ($data) {
            $q->whereBetween('start_time', [$data['start_time'], $data['end_time']])
              ->orWhereBetween('end_time', [$data['start_time'], $data['end_time']]);
        })->first();
    if ($teacherConflict) $conflicts[] = 'শিক্ষক এই সময়ে অন্য ক্লাসে আছেন';

    // 2. Same class-batch with two subjects at the same time?
    $classConflict = Routine::where('program_id', $data['program_id'])
        ->where('batch_id', $data['batch_id'])
        ->where('day_of_week', $data['day_of_week'])
        ->where(function($q) use ($data) {
            $q->whereBetween('start_time', [$data['start_time'], $data['end_time']])
              ->orWhereBetween('end_time', [$data['start_time'], $data['end_time']]);
        })->first();
    if ($classConflict) $conflicts[] = 'এই ক্লাসে এই সময়ে অন্য বিষয় আছে';

    return $conflicts;
}

public function createRoutineSlot(array $data): Routine {
    $conflicts = $this->checkConflict($data);
    if (!empty($conflicts)) throw new \Exception(implode(', ', $conflicts));
    return Routine::create($data);
}
```

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /routines | রুটিন দেখা (class+batch filter) |
| POST | /routines | নতুন স্লট যোগ |
| PUT | /routines/{id} | স্লট আপডেট |
| DELETE | /routines/{id} | স্লট মুছে ফেলা |
| GET | /routines/teacher | শিক্ষকের নিজের রুটিন |
| GET | /routines/today | আজকের রুটিন (Teacher Dashboard) |
| GET | /routines/{programId}/print | রুটিন PDF |

## React Routine Builder UI
```
Grid Layout:
  Rows: সময় (৭AM, ৮AM, ৯AM... ৩PM)
  Columns: শনি, রবি, সোম, মঙ্গল, বুধ, বৃহস্পতি

প্রতিটি cell-এ:
  - বিষয়ের নাম
  - শিক্ষকের নাম
  - "+" বাটন → slot add modal

Add Modal:
  - বিষয় select
  - শিক্ষক select (বিষয় অনুযায়ী auto-filter)
  - সময় select (start + end)
  - কক্ষ নম্বর
  - Submit → conflict check → save
```

## Print Format
- A4 landscape — সব দিন একসাথে
- ক্লাস ও সেকশন হেডার
- Institution logo সহ

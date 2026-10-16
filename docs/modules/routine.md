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


## D96 shared writer-lock protocol (design only)

Every future leave-linked cover, routine/block, eligibility/source, leave reconciliation and dated period-attendance writer must acquire the tenant institution row first inside its outer transaction. No route/model-bound business row may be locked before this boundary. Discover affected rows under that lock, then lock existing rows by this common table rank and ascending primary key: institutions -> users -> institution_departments -> department_memberships -> department_duties -> department_duty_assignments -> teachers -> programs -> batches -> subjects -> batch_teachers -> teacher_subjects -> routines -> routine_blocks -> leave_applications -> leave_substitution_slots -> leave_substitution_operations -> leave_substitution_events -> period_attendances -> audit_logs. Notification storage rank remains gated until its primitive is approved; no unknown delivery writer may bypass this protocol. One tenant per transaction; no ad-hoc cross-tenant batch locking.

Lock the complete affected set, not only the requested routine: substitute leave may invalidate covers for several applicant leaves, and separate routine IDs can compete for the same Teacher/time. Recompute versions, source fingerprints and all conflicts after locking. Any relevant source/eligibility mutation invalidates affected actionable slots with history/version increments before commit, even if a later edit restores the original values. Keep past history and approved snapshots; reject forbidden destructive past edits. Conflict exclusion ID comes only from the trusted tenant-bound model/occurrence being updated, never data['id'] or a caller-selected body/query ID. Strict overlap is start < other.end AND end > other.start; adjacent periods are permitted. Weekly routine is not rewritten by confirmed dated cover.

Current writer audit: LeaveService::create/transition and StaffAttendanceService::save already take the institution lock, but do not prove complete cover integration. TeacherService::update/delete, AcademicStructureService::saveBatch/deleteBatch/deleteSubject/deleteProgram and their controller/direct-model callers need the same outer boundary before relevant writes. UserObserver runs after mutation and cannot establish the required outer lock; all User eligibility writers must participate before save/delete. Daily AttendanceService::saveBulk is not dated period attendance. Future routine/block/period/import/job/bulk paths, calendar/settings and tenant purge/import require explicit inventory and classification; no exhaustive implementation claim follows. Contact-only changes or access revocation alone must not be silently treated as physical cover cancellation. Existing model/service code is unchanged.

Retry recognized transactional deadlocks/timeouts by rolling back and rerunning the whole transaction up to3 attempts with the same operation identity; never retry partial business writes or repeat delivery. Two real MySQL connections must prove competing accepts across different routines and accept-versus-leave/block/source/eligibility races. SQLite/static checks do not prove serialization. Any uncovered writer blocks exposure, including writers introduced after this inventory.


## D96/D99 occurrence identity across leave cycles

Per-leave slot uniqueness permits new slots after a D85 cancel/reapply; it does not allow two active leaves to claim one dated source occurrence. Every materializer must hold the institution lock, perform D85 overlap checks and reject a different non-cancelled slot for the same tenant/routine/date. Cancelled old slots/events remain bound to their original leave and source snapshots. No slot reparenting, hard-delete or weekly routine rewrite. A source change must first invalidate affected future slots; same-leave refresh after that invalidation still needs its own reviewed transition and must not silently revive cancelled versions. Real two-connection checks remain required for runtime acceptance.


## D96 source refresh after invalidation (design only)

A source writer cancels stale future offers/confirmation with source_invalidated under the shared lock; restoring source fields later does not restore cover authority. The separate reviewer refresh-source action described in `docs/API.md` may be implemented only after its event/history/read gates close. It retains occurrence/leave/original-Teacher identity, validates both old/new cutoff and live routine/working-date eligibility, then creates a fresh unassigned version; later offer/acceptance is separate. Deleted/different-day/different-Teacher source and terminal cancelled/rejected leave cannot be retargeted through refresh. Weekly routine CRUD remains a different permission.

Historical source program/batch/subject cannot be recovered by joining an old event to today's mutable routine. The current D99 history shape therefore needs a further reviewed D96 design-only snapshot/key refinement before refresh is storage-ready. No automatic refresh job, new enum, field, migration or runtime writer is introduced by this paragraph.

# Session & Academic Year Management

## Academic Year Lifecycle
```
নতুন বছর শুরু (জানুয়ারি/জুলাই):
  1. Admin → Settings → Academic Year → "নতুন বছর শুরু করুন"
  2. নতুন AcademicYear record তৈরি (2025-2026)
  3. is_current = true (পুরোনোটা false)
  4. Class Promotion wizard খোলে:
     → কোন ক্লাস থেকে কোথায় উঠবে সেট করুন
     → Pass করা ছাত্রদের promote করুন
     → Fail করা ছাত্রদের same class রাখুন
  5. নতুন ফি structure সেট করুন
  6. নতুন Exam schedule তৈরি করুন
```

## AcademicYearMiddleware
```php
// Inject current academic year into every query
class AcademicYearMiddleware {
    public function handle($request, Closure $next) {
        $year = Cache::remember(
            "current_year:" . app('currentInstitution')->id, 3600,
            fn() => AcademicYear::where('institution_id', app('currentInstitution')->id)
                                 ->where('is_current', true)->first()
        );
        if ($year) app()->instance('currentYear', $year);
        return $next($request);
    }
}
// app('currentYear')->id → used to filter attendance, result, fee
```

## Data Archiving Old Records (Revision 7)
বছর-শেষে হাজিরা `archived_attendances`-এ সরানো। Console command-এ কোনো tenant বাঁধা থাকে না (D25), তাই প্রতিটি প্রতিষ্ঠানের জন্য আলাদা `Tenancy::as()`; একটির ব্যর্থতা অন্যদের আটকায় না; প্রতিটি প্রতিষ্ঠানের কাজ একটি transaction-এ (আংশিক সরানো থাকে না)।
```php
// php artisan academic:archive 2024 [--institution=ID]
class ArchiveAcademicData extends Command
{
    protected $signature = 'academic:archive {year} {--institution=}';

    public function handle(): int
    {
        $year = (int) $this->argument('year');
        $failed = 0;
        $institutions = $this->option('institution') ? Institution::whereKey($this->option('institution'))->get() : Institution::whereIn('status', ['trial', 'active'])->get();

        foreach ($institutions as $institution) {
            try {
                Tenancy::as($institution, fn () => DB::transaction(function () use ($year, $institution) {
                    $ay = AcademicYear::where('name', 'like', "$year%")->first();
                    if (!$ay) return;                                     // coaching tenants may have no academic year: nothing to archive
                    // The tenant scope does NOT apply to raw statements - the institution_id condition is mandatory (and listed in tenancy-allowlist.php)
                    $copied = DB::affectingStatement("INSERT INTO archived_attendances
                        (id, institution_id, student_id, program_id, batch_id, date, status, note, taken_by, created_at, academic_year_id)
                        SELECT id, institution_id, student_id, program_id, batch_id, date, status, note, taken_by, created_at, ?
                        FROM attendances WHERE institution_id = ? AND YEAR(date) = ?", [$ay->id, $institution->id, $year]);
                    $removed = Attendance::whereYear('date', $year)->delete();      // Eloquent => tenant-scoped, no raw DELETE
                    abort_unless($copied === $removed, 500, 'archive count mismatch - rolled back');
                    $this->info("{$institution->slug}: $removed rows archived");
                }));
            } catch (\Throwable $e) {
                $failed++; report($e); $this->error("{$institution->slug}: {$e->getMessage()}");
            }
        }
        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
```

## Class Capacity Enforcement
```php
// max_capacity column in batches table
-- (Revision 6: max_capacity already exists in the batches table definition — schema.sql; do NOT add it again)

// Check at enrollment time
public function checkClassCapacity(int $batchId): void {
    $batch      = Batch::findOrFail($batchId);
    $currentCount = Enrollment::where('batch_id', $batchId)->where('status', 'active')->count();   // enrollments, not students.batch_id (a coaching student sits in several batches)

    if ($currentCount >= $batch->max_capacity) {
        throw new BusinessException(
            "এই সেকশনে সর্বোচ্চ {$batch->max_capacity} জন ছাত্র ভর্তি করা যাবে",
            'batch_full'
        );
    }
}
```

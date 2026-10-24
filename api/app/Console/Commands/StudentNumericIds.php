<?php

namespace App\Console\Commands;

use App\Models\{AuditLog, Student, User};
use App\Services\StudentService;
use App\Support\Tenancy;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * D160 (3): the owner's one-time change of every student ID that is not yet 10 digits into the new form (YYmmdd of the admission
 * date, else the record date, + the day's global serial). `--dry-run` only lists old -> new; without it each change is saved and
 * written to the audit log, and a login name that was the old ID becomes the new ID. Relations use the row id, so nothing else moves.
 */
class StudentNumericIds extends Command
{
    protected $signature = 'students:numeric-ids {--dry-run : list the changes, save nothing} {--by= : the Super Admin running it (user id or phone), the audit log\'s actor}';
    protected $description = 'D160: convert student IDs with letters to the 10-digit ID (owner-run, once)';

    public function handle(StudentService $students): int
    {
        $dry = (bool) $this->option('dry-run');
        if (!$dry) {
            $by = (string) $this->option('by');
            $actor = User::whereNull('institution_id')->where('role', 'super_admin')->where(fn ($q) => $q->where('id', $by)->orWhere('phone', $by))->first();
            if (!$actor) { $this->error('--by=<Super Admin id or phone> is required to save (the audit log names who converted the IDs)'); return self::FAILURE; }
            auth()->setUser($actor);
        }
        $planned = [];                                                             // dry run: serials taken so far, per date prefix
        $rows = [];
        Tenancy::withoutTenancy(function () use ($students, $dry, &$planned, &$rows) {
            $old = Student::withTrashed()->whereRaw('student_id NOT REGEXP ?', ['^[0-9]{10}$'])->with('institution')
                ->orderByRaw('COALESCE(admission_date, DATE(created_at))')->orderBy('id')->get();
            foreach ($old as $s) {
                $oldId = $s->student_id;
                $date = ($s->admission_date ?? $s->created_at)?->toDateString();
                if ($dry) {
                    $prefix = Carbon::parse($date ?: now())->format('ymd');
                    $next = $students->generateStudentId($date);
                    $planned[$prefix] = max($planned[$prefix] ?? 0, (int) substr($next, -4) - 1) + 1;
                    $new = $prefix . str_pad((string) $planned[$prefix], 4, '0', STR_PAD_LEFT);
                } else {
                    $new = DB::transaction(function () use ($s, $students, $date) {
                        $new = $students->generateStudentId($date);
                        $old = $s->student_id;
                        $s->forceFill(['student_id' => $new])->saveQuietly();
                        User::whereKey($s->user_id)->where('username', $old)->update(['username' => $new]);   // the login name followed the ID
                        Tenancy::as($s->institution, fn () => AuditLog::record('student.id_converted', $s, ['old' => $old, 'new' => $new]));
                        return $new;
                    });
                }
                $rows[] = [$s->institution?->slug, $s->id, $oldId, $new];
            }
        });
        $this->table(['institution', 'row', 'old ID', 'new ID'], $rows);
        $this->info(($dry ? 'dry run - nothing saved; ' : 'saved; ') . count($rows) . ' student(s)');
        return self::SUCCESS;
    }
}

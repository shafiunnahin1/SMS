<?php

namespace Tests\Feature\Substitution;

use App\Models\{Institution, LeaveApplication, LeaveSubstitutionEvent, LeaveSubstitutionOperation, LeaveSubstitutionSlot, LeaveType, Routine, Teacher, User};
use App\Services\Substitution\SlotActionService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D200 SUBL.6 (docs/TESTING.md D199 concurrency cases): two REAL MySQL connections (separate PHP processes, committed data - never
// SQLite, never one wrapped transaction). The test holds the institution row, lets both workers reach the lock, then releases
// it: each race must serialize to one legal outcome, and a lock that never frees gives 409 substitution_retry_required after
// three whole-transaction attempts with nothing written.
class SubstitutionConcurrencyTest extends TestCase
{
    use DatabaseMigrations, ExamFixture;

    protected function afterRefreshingDatabase()
    {
        $this->beforeApplicationDestroyed(function () {
            if (DB::connection()->getDatabaseName() !== 'edu_saas_test') throw new \LogicException('Test database required');
            if (!($i = Institution::where('slug', 'subrace')->first())) return;
            $i->forceFill(['status' => 'expired', 'subscription_expires_at' => now()->subDays(40)])->save();
            app(\App\Services\Privacy\TenantPurgeService::class)->execute($i, $this->makeUser(null, 'super_admin')->id);
        });
    }

    /** @param array<int, array> $workers one input per process; $release = false keeps the institution locked until they end */
    private function race(Institution $i, array $workers, bool $release = true): array
    {
        $dir = sys_get_temp_dir() . '/school-sub-race-' . bin2hex(random_bytes(8)); mkdir($dir);
        $ps = [];
        try {
            DB::beginTransaction(); Institution::whereKey($i->id)->lockForUpdate()->firstOrFail();
            foreach ($workers as $n => $w) {
                $p = new Process([PHP_BINARY, base_path('tests/Support/SubstitutionWorker.php')], base_path(),
                    ['APP_ENV' => 'testing', 'DB_DATABASE' => 'edu_saas_test', 'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array', 'MAIL_MAILER' => 'array', 'QUEUE_CONNECTION' => 'sync']);
                $p->setTimeout(40); $p->setInput(json_encode($w + ['institution_id' => $i->id, 'barrier' => $dir, 'slot_no' => $n], JSON_THROW_ON_ERROR));
                $p->start(); $ps[] = $p;
            }
            $deadline = microtime(true) + 20;
            while (count(glob($dir . '/*.ready')) < count($workers)) {
                if (microtime(true) > $deadline) $this->fail('workers did not reach the barrier');
                foreach ($ps as $p) if (!$p->isRunning()) $this->fail('worker stopped before the barrier: ' . $p->getErrorOutput());
                usleep(10000);
            }
            file_put_contents($dir . '/go', 'go');
            if ($release) {
                usleep(300000);
                foreach ($ps as $p) $this->assertTrue($p->isRunning(), 'a writer did not wait for the institution lock');
                DB::commit();
            }
            $out = [];
            foreach ($ps as $p) { $this->assertSame(0, $p->wait(), $p->getErrorOutput()); $out[] = json_decode($p->getOutput(), true, flags: JSON_THROW_ON_ERROR); }
            if (!$release) DB::commit();
            return $out;
        } finally {
            if (DB::transactionLevel()) DB::rollBack();
            foreach ($ps as $p) if ($p->isRunning()) $p->stop();
            array_map('unlink', glob($dir . '/*')); rmdir($dir);
        }
    }

    public function test_races_serialize_and_a_held_lock_ends_in_retry_required(): void
    {
        $this->assertSame('edu_saas_test', DB::connection()->getDatabaseName());
        $s = $this->school('subrace');
        $i = $s['i']; $h = $s['host'];
        $week = now()->next('Sunday')->addWeek();
        $d = fn (int $n) => $week->copy()->addDays($n)->toDateString();                 // 0 = Sunday ... 4 = Thursday
        [$karim, $other, $free, $freeUser, $admin2, $type, $r] = Tenancy::as($i, function () use ($s, $i) {
            $fu = User::create(['institution_id' => $i->id, 'name' => 'Free teacher', 'email' => 'free-race@example.test', 'password' => 'Secret@1234', 'role' => 'teacher', 'is_active' => true]);
            $karim = Teacher::where('user_id', $s['karimUser']->id)->first();
            $other = Teacher::where('user_id', $s['otherUser']->id)->first();
            $mk = fn ($t, $day, $start, $end, $batch) => Routine::create(['program_id' => $s['p']->id, 'batch_id' => $batch, 'subject_id' => $s['bangla']->id, 'teacher_id' => $t, 'day_of_week' => $day, 'start_time' => $start, 'end_time' => $end]);
            $r = ['sun' => $mk($karim->id, 'sun', '09:00', '09:45', $s['a']->id), 'mon' => $mk($karim->id, 'mon', '09:00', '09:45', $s['a']->id), 'tue' => $mk($karim->id, 'tue', '09:00', '09:45', $s['a']->id),
                'wed' => $mk($karim->id, 'wed', '09:00', '09:45', $s['a']->id), 'thu' => $mk($karim->id, 'thu', '09:00', '09:45', $s['a']->id), 'wed2' => $mk($other->id, 'wed', '09:20', '10:05', $s['b']->id)];
            return [$karim, $other, Teacher::create(['user_id' => $fu->id, 'employee_id' => 'T-FR']), $fu, User::create(['institution_id' => $i->id, 'name' => 'Second admin', 'email' => 'admin2-race@example.test', 'password' => 'Secret@1234', 'role' => 'admin', 'is_active' => true]), LeaveType::create(['name' => 'Casual', 'max_days_per_year' => 30, 'is_paid' => true]), $r];
        });
        $choice = fn (Routine $x, int $n, ?Teacher $t) => ['routine_id' => $x->id, 'occurrence_date' => $d($n), 'substitute_teacher_id' => $t?->id];
        $leave = $this->api('POST', $h, 'hr/leaves', $s['admin'], ['user_id' => $s['karimUser']->id, 'leave_type_id' => $type->id, 'from_date' => $d(0), 'to_date' => $d(4)])->assertCreated()->json('data.id');
        $this->api('PATCH', $h, "hr/leaves/{$leave}/approve", $s['admin'], ['cover_choices' => [$choice($r['sun'], 0, null), $choice($r['mon'], 1, $free), $choice($r['tue'], 2, $free), $choice($r['wed'], 3, $free), $choice($r['thu'], 4, null)]])
            ->assertOk()->assertJsonMissingPath('cover_gaps');
        $slotOf = fn (int $lv, Routine $x) => Tenancy::as($i, fn () => LeaveSubstitutionSlot::where('leave_application_id', $lv)->where('routine_id', $x->id)->firstOrFail());
        $exp = fn (LeaveSubstitutionSlot $x) => Tenancy::as($i, fn () => ['slot' => (string) $x->fresh()->version, 'source' => app(SlotActionService::class)->sourceOf(LeaveApplication::find($x->leave_application_id), $x->fresh())]);
        $slotIn = fn (LeaveSubstitutionSlot $x, string $action, User $actor, array $body = []) => ['mode' => 'slot', 'action' => $action, 'leave' => $x->leave_application_id, 'slot' => $x->id,
            'actor_id' => $actor->id, 'key' => 'race-' . Str::uuid(), 'body' => $body + ['expected_versions' => $exp($x)]];
        $state = fn (LeaveSubstitutionSlot $x) => Tenancy::as($i, fn () => [$x->fresh()->status, $x->fresh()->version, $x->fresh()->substitute_teacher_id]);
        $codes = fn (array $out) => [count(array_filter($out, fn ($o) => isset($o['ok']))), array_values(array_filter(array_column($out, 'error')))];

        // 1. two reviewers offer the same slot with the same expected version: exactly one wins
        $sun = $slotOf($leave, $r['sun']);
        $out = $this->race($i, [$slotIn($sun, 'offer', $s['admin'], ['substitute_teacher_id' => (string) $free->id]), $slotIn($sun, 'offer', $admin2, ['substitute_teacher_id' => (string) $other->id])]);
        $this->assertSame([1, ['substitution_version_conflict']], $codes($out));
        $this->assertSame(['offered', 3], array_slice($state($sun), 0, 2));

        // 2. accept versus a routine edit of the source: whatever the order, the slot ends cancelled - never confirmed on a changed source
        $mon = $slotOf($leave, $r['mon']);
        $edit = ['mode' => 'routine', 'routine' => $r['mon']->id, 'actor_id' => $s['admin']->id, 'data' => ['program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'subject_id' => $s['bangla']->id,
            'teacher_id' => $karim->id, 'day_of_week' => 'mon', 'start_time' => '09:10', 'end_time' => '09:55', 'room_no' => null]];
        $out = $this->race($i, [$slotIn($mon, 'accept', $freeUser), $edit]);
        $this->assertSame('cancelled', $state($mon)[0]);
        // accept first: both succeed and the edit cancels the cover; edit first: the slot is cancelled without a target, so the accept is refused (403: no longer the target)
        $this->assertContains($codes($out), [[2, []], [1, ['forbidden']], [1, ['substitution_version_conflict']]]);

        // 3. accept versus the target's own leave approval: the target never ends confirmed on a day they are on leave
        $tue = $slotOf($leave, $r['tue']);
        $freeLeave = $this->api('POST', $h, 'hr/leaves', $s['admin'], ['user_id' => $freeUser->id, 'leave_type_id' => $type->id, 'from_date' => $d(2), 'to_date' => $d(2)])->assertCreated()->json('data.id');
        $out = $this->race($i, [$slotIn($tue, 'accept', $freeUser), ['mode' => 'approve', 'leave' => $freeLeave, 'actor_id' => $s['admin']->id]]);
        $this->assertSame(['unassigned', null], [$state($tue)[0], $state($tue)[2]]);
        $this->assertSame('approved', Tenancy::as($i, fn () => LeaveApplication::find($freeLeave)->status));

        // 4. one target, two overlapping offers (the second forced past the offer check), both accepted at once: exactly one is confirmed
        $wed = $slotOf($leave, $r['wed']);
        $otherLeave = $this->api('POST', $h, 'hr/leaves', $s['admin'], ['user_id' => $s['otherUser']->id, 'leave_type_id' => $type->id, 'from_date' => $d(3), 'to_date' => $d(3)])->assertCreated()->json('data.id');
        $this->api('PATCH', $h, "hr/leaves/{$otherLeave}/approve", $s['admin'])->assertOk();
        $wed2 = $slotOf($otherLeave, $r['wed2']);
        Tenancy::as($i, fn () => $wed2->forceFill(['status' => 'offered', 'substitute_teacher_id' => $free->id])->save());
        $out = $this->race($i, [$slotIn($wed, 'accept', $freeUser), $slotIn($wed2, 'accept', $freeUser)]);
        $this->assertSame([1, ['substitution_unavailable']], $codes($out));
        $this->assertSame(1, Tenancy::as($i, fn () => LeaveSubstitutionSlot::whereIn('id', [$wed->id, $wed2->id])->where('status', 'confirmed')->count()));

        // 5. the institution row never frees: three whole-transaction attempts (lock wait timeout 1 s each), then 409 with nothing written
        $thu = $slotOf($leave, $r['thu']);
        $before = [$state($thu), Tenancy::as($i, fn () => [LeaveSubstitutionOperation::count(), LeaveSubstitutionEvent::count()])];
        $started = microtime(true);
        $out = $this->race($i, [$slotIn($thu, 'offer', $s['admin'], ['substitute_teacher_id' => (string) $other->id]) + ['lock_wait' => 1]], false);
        $this->assertSame([0, ['substitution_retry_required']], $codes($out));
        $this->assertGreaterThan(2.5, microtime(true) - $started);                     // it really waited three times
        $this->assertSame($before, [$state($thu), Tenancy::as($i, fn () => [LeaveSubstitutionOperation::count(), LeaveSubstitutionEvent::count()])]);

        // every slot of the run still has exactly one event per version (the forced one aside)
        Tenancy::as($i, fn () => LeaveSubstitutionSlot::whereKeyNot($wed2->id)->get()->each(fn ($x) => $this->assertSame($x->version, LeaveSubstitutionEvent::where('leave_substitution_slot_id', $x->id)->count(), "slot {$x->id}")));
    }
}

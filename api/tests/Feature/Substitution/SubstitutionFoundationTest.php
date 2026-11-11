<?php

namespace Tests\Feature\Substitution;

use App\Exceptions\BusinessException;
use App\Models\{LeaveSubstitutionEvent, LeaveSubstitutionOperation, LeaveSubstitutionSlot, Subject};
use App\Services\Substitution\{CanonicalJson, InstitutionLock, OperationReceipts};
use App\Support\Tenancy;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D200 SUBL.2: canonical JSON and digests (API.md D99); receipt replay / conflict; the retry of deadlocks only; and every source
// writer of routine.md D199: its future live slots get exactly one version and one source_invalidated event, past and cancelled
// slots are untouched, history blocks hard deletes.
class SubstitutionFoundationTest extends TestCase
{
    use RefreshDatabase, ExamFixture, SubstitutionFixture;

    public function test_canonical_json_and_digests(): void
    {
        $this->assertSame('{"a":[true,null,"x/é"],"b":{"1":"2","a":"1"},"c":{}}', CanonicalJson::encode(['c' => new \stdClass(), 'b' => ['a' => '1', '1' => '2'], 'a' => [true, null, 'x/é']]));
        $this->assertSame(CanonicalJson::sha256(['b' => '1', 'a' => '2']), CanonicalJson::sha256(['a' => '2', 'b' => '1']));
        $this->assertNotSame(CanonicalJson::sha256(['1', '2']), CanonicalJson::sha256(['2', '1']));           // lists keep their order
        foreach ([1, 1.5, ['id' => 7], "\xB1\x31"] as $bad) {
            try { CanonicalJson::encode($bad); $this->fail('accepted ' . json_encode($bad, JSON_INVALID_UTF8_SUBSTITUTE)); } catch (\InvalidArgumentException) { $this->addToAssertionCount(1); }
        }
        $r = app(OperationReceipts::class);
        $this->assertSame(hash('sha256', '["leave-substitution-key-v1","Key-1"]'), $r->keyDigest('Key-1'));
        $this->assertNotSame($r->keyDigest('Key-1'), $r->keyDigest('key-1'));                                   // no case folding or trimming
        foreach ([null, '', str_repeat('k', 129)] as $bad) {
            try { $r->keyDigest($bad); $this->fail('accepted key'); } catch (BusinessException $e) { $this->assertSame(422, $e->status); }
        }
        $this->expectException(\InvalidArgumentException::class);
        $r->payloadDigest(['format' => 'leave-substitution-v1', 'action' => 'offer']);
    }

    public function test_receipt_replay_and_conflict(): void
    {
        $s = $this->school('rcp');
        Tenancy::as($s['i'], function () use ($s) {
            $r = app(OperationReceipts::class);
            $env = fn (string $target) => $r->envelope('offer', ['type' => 'leave_substitution_slot', 'leave_id' => '1', 'id' => '1'], $r->context($s['admin']), ['substitute_teacher_id' => $target], ['slot' => '1']);
            $key = $r->keyDigest('abc');
            $this->assertNull($r->replay($s['admin'], $key, $r->payloadDigest($env('5'))));
            $op = $r->record($s['admin'], 'offer', $key, $r->payloadDigest($env('5')), 'ok', 200, 0);
            $this->assertSame($op->id, $r->replay($s['admin'], $key, $r->payloadDigest($env('5')))->id);
            $this->assertNull($r->replay($s['karimUser'], $key, $r->payloadDigest($env('5'))));                 // the key is per actor
            $this->assertSame(['operation_id' => $op->id, 'leave_id' => null, 'result_code' => 'ok', 'result_http_status' => 200, 'result_slot_count' => 0, 'events' => []], $r->manifest($op));
            try { $r->replay($s['admin'], $key, $r->payloadDigest($env('6'))); $this->fail('no conflict'); }
            catch (BusinessException $e) { $this->assertSame([409, 'idempotency_conflict'], [$e->status, $e->errorCode]); }
        });
    }

    public function test_only_deadlocks_are_retried_three_times(): void
    {
        $lock = app(InstitutionLock::class);
        $dead = function (int $code) { $p = new \PDOException('x'); $p->errorInfo = ['40001', $code, 'x']; return new QueryException('mysql', 'select 1', [], $p); };
        $n = 0;
        $this->assertSame('done', $lock->retrying(function () use (&$n, $dead) { if (++$n < 3) throw $dead($n === 1 ? 1213 : 1205); return 'done'; }));
        $this->assertSame(3, $n);
        $n = 0;
        try { $lock->retrying(function () use (&$n, $dead) { $n++; throw $dead(1213); }); $this->fail('no stop'); }
        catch (BusinessException $e) { $this->assertSame([409, 'substitution_retry_required', 3], [$e->status, $e->errorCode, $n]); }
        $n = 0;
        try { $lock->retrying(function () use (&$n, $dead) { $n++; throw $dead(1062); }); $this->fail('retried'); }
        catch (QueryException) { $this->assertSame(1, $n); }
    }

    public function test_source_writers_invalidate_future_live_slots(): void
    {
        $this->travelTo('2030-01-01 08:00:00');
        $s = $this->school('inv');
        $h = $s['host'];
        $f = $this->leaveWithRoutine($s);
        $state = fn (LeaveSubstitutionSlot $x) => Tenancy::as($s['i'], fn () => [$x->fresh()->status, $x->fresh()->version, $x->fresh()->substitute_teacher_id]);
        $last = fn (LeaveSubstitutionSlot $x) => Tenancy::as($s['i'], fn () => LeaveSubstitutionEvent::where('leave_substitution_slot_id', $x->id)->orderByDesc('version')->first());
        $body = fn (array $o = []) => $o + ['program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'subject_id' => $s['bangla']->id, 'teacher_id' => $f['karim']->id, 'day_of_week' => 'sun', 'start_time' => '09:00', 'end_time' => '09:45', 'room_no' => '101'];

        // routine: an unchanged save touches nothing; a time change cancels the future live slot, not the past or the cancelled one
        $future = $this->slot($s, $f, '2030-01-06', 'confirmed', $f['other']->id);
        $past = $this->slot($s, $f, '2029-12-30', 'confirmed', $f['other']->id);
        $gone = $this->slot($s, $f, '2030-01-13', 'cancelled');
        $this->api('PUT', $h, "routines/{$f['routine']->id}", $s['admin'], $body())->assertOk();
        $this->assertSame(['confirmed', 1, $f['other']->id], $state($future));
        $this->api('PUT', $h, "routines/{$f['routine']->id}", $s['admin'], $body(['start_time' => '09:05']))->assertOk();
        $this->assertSame(['cancelled', 2, null], $state($future));
        $this->assertSame([['confirmed', 1, $f['other']->id], ['cancelled', 1, null]], [$state($past), $state($gone)]);
        $e = $last($future);
        $this->assertSame(['source_invalidated', 'cancelled', 'routine_changed', '09:00:00', $s['a']->id, $s['admin']->id], [$e->event_type, $e->result_status, $e->reason_code, $e->source_start_time, $e->source_batch_id, $e->user_id]);
        $op = Tenancy::as($s['i'], fn () => LeaveSubstitutionOperation::find($e->leave_substitution_operation_id));
        $this->assertSame(['source_invalidate', 1, null], [$op->action, $op->result_slot_count, $op->leave_application_id]);
        // a routine with cover history is edited, never deleted
        $this->api('DELETE', $h, "routines/{$f['routine']->id}", $s['admin'])->assertStatus(422)->assertJsonPath('error', 'in_use');

        // another teacher takes the routine: identity_changed
        $g = $this->leaveWithRoutine($s, '2030-01-07', 'mon');
        $x = $this->slot($s, $g, '2030-01-07', 'offered', $g['other']->id);
        $this->api('PUT', $h, "routines/{$g['routine']->id}", $s['admin'], $body(['day_of_week' => 'mon', 'teacher_id' => $g['other']->id, 'room_no' => '102']))->assertOk();
        $this->assertSame(['cancelled', 'identity_changed'], [$state($x)[0], $last($x)->reason_code]);

        // teacher: the target goes inactive -> back to a gap; the original goes away -> cancelled
        $k = $this->leaveWithRoutine($s, '2030-01-08', 'tue');
        $cover = $this->slot($s, $k, '2030-01-08', 'confirmed', $k['other']->id);
        $this->api('PUT', $h, "teachers/{$k['other']->id}", $s['admin'], ['status' => 'inactive'])->assertOk();
        $this->assertSame([['unassigned', 2, null], 'target_inactive', 'unassigned'], [$state($cover), $last($cover)->reason_code, $last($cover)->result_status]);
        $this->api('DELETE', $h, "teachers/{$k['karim']->id}", $s['admin'])->assertOk();
        $this->assertSame([['cancelled', 3, null], 'teacher_inactive'], [$state($cover), $last($cover)->reason_code]);

        // history keeps its subject: a hard delete is refused
        $this->api('DELETE', $h, "subjects/{$s['bangla']->id}", $s['admin'])->assertStatus(422)->assertJsonPath('error', 'in_use');
        $this->assertSame(1, Tenancy::as($s['i'], fn () => Subject::whereKey($s['bangla']->id)->count()));
        // every slot has exactly one event per version
        Tenancy::as($s['i'], fn () => LeaveSubstitutionSlot::all()->each(fn ($x) => $this->assertSame($x->version, LeaveSubstitutionEvent::where('leave_substitution_slot_id', $x->id)->count())));
    }
}

<?php

namespace Tests\Feature\Admission;

use App\Models\{AdmissionCycle, AdmissionDraw, AdmissionLead, AuditLog};
use App\Services\Admission\{AdmissionCycleService, AdmissionListService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D209 ACY.3 (docs/modules/admission-cycle.md section 6): MeritTieBreakTest, CommitmentTest (wrong seed 422, the seed is stored
// only after the reveal), DrawReproducibleTest, DrawFairnessTest, FreezeTest (a changed applicant list refuses the draw),
// SeedLossFallbackTest and the public transparency record (numbers only; names only when the cycle publishes them).
class AdmissionListTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    /** a cycle in `testing` with the given applicants (application_no => [created order, marks]) who all sat the test */
    private function frozen(array $s, string $mode, array $apps, array $rule = []): AdmissionCycle
    {
        return Tenancy::as($s['i'], function () use ($s, $mode, $apps, $rule) {
            $c = AdmissionCycle::create(['name' => 'C', 'program_id' => $s['p']->id, 'seats' => 2, 'apply_from' => '2030-01-01', 'apply_until' => '2030-12-31',
                'status' => 'open', 'rule' => app(AdmissionCycleService::class)->rule(['mode' => $mode, 'waiting' => 1] + $rule)]);
            foreach ($apps as $no => $marks) AdmissionLead::create(['name' => 'Name ' . $no, 'phone' => '01711000500', 'cycle_id' => $c->id, 'application_no' => $no, 'test_marks' => $marks]);   // fee 0: every one takes part
            return $c;
        });
    }

    public function test_merit_tie_break_and_min_marks(): void
    {
        $this->travelTo('2030-02-01 10:00:00');
        $s = $this->school('acym');
        // created (applied) in this order: C (1st), D (2nd), A (3rd), E (4th), B (5th)
        $c = $this->frozen($s, 'merit', ['A30-CCCCC' => null, 'A30-DDDDD' => null, 'A30-AAAAA' => null, 'A30-EEEEE' => null, 'A30-BBBBB' => null], ['min_marks' => 40]);
        $this->api('POST', $s['host'], "admission/cycles/{$c->id}/freeze", $s['admin'])->assertOk();
        $this->api('POST', $s['host'], "admission/cycles/{$c->id}/list/lottery", $s['admin'], ['seed' => str_repeat('a', 64)])->assertStatus(422)->assertJsonPath('error', 'cycle_wrong_mode');
        $this->api('POST', $s['host'], "admission/cycles/{$c->id}/test-marks", $s['admin'], ['rows' => [['application_no' => 'A30-ZZZZZ', 'marks' => 50]]])->assertStatus(422);
        // the spec's example: A 78, B 82, C 78, D 65 => B, C, A, D; E below min_marks is cut
        $this->api('POST', $s['host'], "admission/cycles/{$c->id}/test-marks", $s['admin'], ['rows' => [
            ['application_no' => 'A30-AAAAA', 'marks' => 78], ['application_no' => 'A30-BBBBB', 'marks' => 82], ['application_no' => 'A30-CCCCC', 'marks' => '78.00'],
            ['application_no' => 'A30-DDDDD', 'marks' => 65], ['application_no' => 'A30-EEEEE', 'marks' => 39.5]]])->assertOk()->assertJsonPath('data.saved', 5);
        $r = $this->api('POST', $s['host'], "admission/cycles/{$c->id}/list/merit", $s['admin'])->assertOk()->assertJsonPath('data.cycle.status', 'listing');
        $this->assertSame(['A30-BBBBB', 'A30-CCCCC', 'A30-AAAAA', 'A30-DDDDD'], array_column($r->json('data.list'), 'application_no'));
        $this->assertSame(['selected', 'selected', 'waiting', 'rejected'], array_column($r->json('data.list'), 'list_status'));
        Tenancy::as($s['i'], fn () => $this->assertSame([null, 'rejected'], [AdmissionLead::where('application_no', 'A30-EEEEE')->value('merit_rank'), AdmissionLead::where('application_no', 'A30-EEEEE')->value('list_status')]));
        $this->api('POST', $s['host'], "admission/cycles/{$c->id}/list/merit", $s['admin'])->assertStatus(422);   // once
        $this->api('POST', $s['host'], "admission/cycles/{$c->id}/test-marks", $s['admin'], ['rows' => [['application_no' => 'A30-AAAAA', 'marks' => 99]]])->assertStatus(422);   // marks are fixed
    }

    public function test_commitment_reveal_reproducible_and_public_record(): void
    {
        $this->travelTo('2030-02-01 10:00:00');
        $s = $this->school('acyl');
        $nos = ['A30-K2M7P', 'A30-9QW3R', 'A30-TT5XY', 'A30-H8N4C', 'A30-ZZ2A3'];
        $c = $this->frozen($s, 'lottery', array_fill_keys($nos, null));
        Tenancy::as($s['i'], fn () => $c->update(['status' => 'draft']));
        $seed = $this->api('POST', $s['host'], "admission/cycles/{$c->id}/open", $s['admin'])->json('data.seed');
        $this->api('POST', $s['host'], "admission/cycles/{$c->id}/freeze", $s['admin'])->assertOk();

        // before the draw the public sees the commitment and the applicants, never a seed
        $this->app['auth']->forgetGuards();
        $pub = $this->getJson("http://{$s['host']}/api/v1/public/admission/cycle/{$c->id}/transparency")->assertOk();
        $sorted = $nos; sort($sorted, SORT_STRING);
        $this->assertSame($sorted, $pub->json('data.applicants'));
        $this->assertSame(AdmissionCycleService::applicantsHash($sorted), $pub->json('data.draw.applicants_hash'));
        $this->assertNull($pub->json('data.draw.seed'));

        // a wrong seed: 422, nothing stored
        $this->api('POST', $s['host'], "admission/cycles/{$c->id}/list/lottery", $s['admin'], ['seed' => str_repeat('0', 64)])->assertStatus(422)->assertJsonPath('error', 'seed_mismatch');
        $this->api('POST', $s['host'], "admission/cycles/{$c->id}/list/lottery", $s['admin'], ['seed' => 'not-hex'])->assertStatus(422);
        $this->assertSame(0, DB::table('admission_draws')->whereNotNull('seed_reveal')->count());

        $r = $this->api('POST', $s['host'], "admission/cycles/{$c->id}/list/lottery", $s['admin'], ['seed' => strtoupper($seed)])->assertOk();
        $expected = AdmissionListService::lotteryOrder($seed, $nos);
        $this->assertSame($expected, $r->json('data.draw.order'));
        $this->assertSame($expected, array_column($r->json('data.list'), 'application_no'));
        $this->assertSame(['selected', 'selected', 'waiting', 'rejected', 'rejected'], array_column($r->json('data.list'), 'list_status'));

        // the public record now carries the seed and the order, numbers only (names are off by default); anyone can recompute
        $this->app['auth']->forgetGuards();
        $pub = $this->getJson("http://{$s['host']}/api/v1/public/admission/cycle/{$c->id}/transparency")->assertOk();
        $this->assertSame([$seed, 'hmac-sha256/v1', 'strong'], [$pub->json('data.draw.seed'), $pub->json('data.draw.algorithm'), $pub->json('data.draw.guarantee')]);
        $this->assertSame(hash('sha256', hex2bin($pub->json('data.draw.seed'))), $pub->json('data.draw.seed_commitment'));
        $this->assertSame($expected, AdmissionListService::lotteryOrder($pub->json('data.draw.seed'), $pub->json('data.applicants')));
        $this->assertArrayNotHasKey('name', $pub->json('data.list.0'));
        Tenancy::as($s['i'], fn () => $c->update(['rule' => array_merge($c->rule, ['publish_names' => true])]));
        $this->assertSame('Name ' . $expected[0], $this->getJson("http://{$s['host']}/api/v1/public/admission/cycle/{$c->id}/transparency")->json('data.list.0.name'));
        $this->assertStringNotContainsString($seed, json_encode(Tenancy::as($s['i'], fn () => AuditLog::get()->toArray())));
    }

    public function test_draw_is_reproducible_independent_of_input_order_and_late_entries(): void
    {
        $seed = hash('sha256', 'fixture seed');
        $nos = ['A30-AAAAA', 'A30-BBBBB', 'A30-CCCCC', 'A30-DDDDD', 'A30-EEEEE', 'A30-FFFFF'];
        $order = AdmissionListService::lotteryOrder($seed, $nos);
        // the fixed reference: sort by hex(HMAC-SHA256(seed bytes, no))
        $ref = $nos;
        usort($ref, fn ($a, $b) => strcmp(hash_hmac('sha256', $a, hex2bin($seed)), hash_hmac('sha256', $b, hex2bin($seed))));
        $this->assertSame($ref, $order);
        $this->assertSame($order, AdmissionListService::lotteryOrder($seed, array_reverse($nos)));            // input order does not matter
        $late = AdmissionListService::lotteryOrder($seed, [...$nos, 'A30-GGGGG']);
        $this->assertSame($order, array_values(array_filter($late, fn ($n) => $n !== 'A30-GGGGG')));             // a late entry keeps the others' order
        $this->assertNotSame($order, AdmissionListService::lotteryOrder(hash('sha256', 'other seed'), $nos));  // another seed, another order
    }

    public function test_draw_fairness_over_4000_seeds(): void
    {
        $nos = array_map(fn ($n) => sprintf('A30-%05d', $n), range(1, 20));
        $top5 = array_fill_keys($nos, 0);
        $pos = array_fill_keys($nos, 0);
        for ($k = 0; $k < 4000; $k++) {
            $order = AdmissionListService::lotteryOrder(hash('sha256', "seed {$k}"), $nos);
            foreach ($order as $p => $no) { $pos[$no] += $p; if ($p < 5) $top5[$no]++; }
        }
        // expectation 1,000 top-5 places each; 4 sigma = 890..1110; mean position 9.5
        foreach ($top5 as $no => $n) $this->assertTrue($n >= 890 && $n <= 1110, "{$no}: {$n} top-5 places");
        foreach ($pos as $no => $sum) $this->assertEqualsWithDelta(9.5, $sum / 4000, 0.5, "{$no} mean position");
    }

    public function test_freeze_guard_and_seed_loss_fallback(): void
    {
        $this->travelTo('2030-02-01 10:00:00');
        $s = $this->school('acyf');
        $c = $this->frozen($s, 'lottery', ['A30-AAAAA' => null, 'A30-BBBBB' => null, 'A30-CCCCC' => null]);
        Tenancy::as($s['i'], fn () => $c->update(['status' => 'draft']));
        $seed = $this->api('POST', $s['host'], "admission/cycles/{$c->id}/open", $s['admin'])->json('data.seed');
        $this->api('POST', $s['host'], "admission/cycles/{$c->id}/freeze", $s['admin'])->assertOk();

        // someone slips an applicant in after the freeze: the draw is refused
        $sneak = Tenancy::as($s['i'], fn () => AdmissionLead::create(['name' => 'Late', 'phone' => '01711000599', 'cycle_id' => $c->id, 'application_no' => 'A30-LLLLL', 'test_roll' => '0099'])->id);
        $this->api('POST', $s['host'], "admission/cycles/{$c->id}/list/lottery", $s['admin'], ['seed' => $seed])->assertStatus(422)->assertJsonPath('error', 'applicants_changed');
        Tenancy::as($s['i'], fn () => DB::table('admission_leads')->where('id', $sneak)->delete());

        // the seed was lost: a new commitment, marked weaker in the admin and the public record; the old seed no longer works
        $r = $this->api('POST', $s['host'], "admission/cycles/{$c->id}/draw/recommit", $s['admin'])->assertOk()->assertJsonPath('data.draw.guarantee', 'weaker');
        $new = $r->json('data.seed');
        $this->assertNotSame($seed, $new);
        $this->api('POST', $s['host'], "admission/cycles/{$c->id}/list/lottery", $s['admin'], ['seed' => $seed])->assertStatus(422)->assertJsonPath('error', 'seed_mismatch');
        $this->api('POST', $s['host'], "admission/cycles/{$c->id}/list/lottery", $s['admin'], ['seed' => $new])->assertOk()->assertJsonPath('data.draw.guarantee', 'weaker');
        $this->app['auth']->forgetGuards();
        $this->getJson("http://{$s['host']}/api/v1/public/admission/cycle/{$c->id}/transparency")->assertOk()->assertJsonPath('data.draw.guarantee', 'weaker');
        Tenancy::as($s['i'], fn () => $this->assertSame(1, AdmissionDraw::count()));
        $this->api('POST', $s['host'], "admission/cycles/{$c->id}/draw/recommit", $s['admin'])->assertStatus(422);   // after the draw: no
    }
}

<?php

namespace Tests\Feature\Hostel;

use App\Models\{Batch, Expense, HostelMessBill, Program, Student, User};
use App\Services\{FeeService, StudentService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Artisan, Queue};
use Tests\TestCase;

// D233 HST.3 (docs/modules/hostel.md "Mess"): three meals a day for a with-mess member, meals marked off, the three billing modes
// (fixed_monthly / per_meal closed by the nightly job; meal_rate = bazar / weighted meals closed by staff), the bazar book writing
// and reversing expenses, frozen bills and adjustments, closed months refused, bills as fee dues, the family's own meals and bills.
class HostelMessTest extends TestCase
{
    use RefreshDatabase;

    private function setUpHostel(string $slug): array
    {
        Queue::fake();
        $this->travelTo('2026-11-01 10:00:00');
        $i = $this->makeInstitution($slug, 'school');
        $i->forceFill(['enabled_modules' => ['hostel' => true]])->save();
        $admin = $this->makeUser($i, 'admin');
        $d = Tenancy::as($i, function () {
            $b = Batch::create(['program_id' => Program::create(['name' => 'Class 8'])->id, 'name' => 'A']);
            $svc = app(StudentService::class);
            return ['rafi' => $svc->create(['name' => 'Rafi', 'guardian_phone' => '01711111111'], $b), 'tanim' => $svc->create(['name' => 'Tanim', 'guardian_phone' => '01722222222'], $b)];
        });
        $host = $this->hostOf($i);
        $h = $this->api('POST', $host, 'hostel', $admin, ['name' => 'Hall', 'type' => 'boys'])->assertCreated()->json('data');
        $room = $this->api('POST', $host, "hostel/{$h['id']}/rooms", $admin, ['room_number' => '1', 'capacity' => 4])->assertCreated()->json('data');
        $this->api('POST', $host, 'hostel/allocate', $admin, ['student_id' => $d['rafi']->id, 'room_id' => $room['id'], 'check_in_date' => '2026-11-01'])->assertCreated();
        $t = $this->api('POST', $host, 'hostel/allocate', $admin, ['student_id' => $d['tanim']->id, 'room_id' => $room['id'], 'check_in_date' => '2026-11-21'])->assertCreated()->json('data');   // 10 days in November
        return [$i, $admin, $d, $host, $h, $t];
    }

    private function messDues($i, Student $s): array
    {
        return Tenancy::as($i, fn () => app(FeeService::class)->dueLines(Student::find($s->id))->filter(fn ($l) => $l['category'] === 'হোস্টেল মেস ফি')->map(fn ($l) => [$l['period'], $l['amount']])->values()->all());
    }

    public function test_meal_rate_mode_bazar_offs_close_adjust_and_dues(): void
    {
        [$i, $admin, $d, $host, $h, $tanim] = $this->setUpHostel('mess1');
        $this->api('PUT', $host, "hostel/{$h['id']}/mess", $admin, ['mess_mode' => 'meal_rate', 'breakfast_weight' => '0.5'])->assertOk()->assertJsonPath('data.mess_mode', 'meal_rate');
        $this->api('PUT', $host, "hostel/{$h['id']}/mess", $admin, ['mess_mode' => 'per_meal'])->assertStatus(422)->assertJsonValidationErrors('breakfast_rate');

        // Rafi: 30 days; dinner off on 5 Nov, all three off on 6 Nov. Tanim: 21-30 Nov
        $sheet = $this->api('GET', $host, "hostel/{$h['id']}/meals", $admin, ['date' => '2026-11-05'])->assertOk()->json('data');
        $this->assertSame(['Rafi'], array_column(array_column($sheet['members'], 'student'), 'name'), 'Tanim was not here on the 5th');
        $this->api('PUT', $host, "hostel/{$h['id']}/meals", $admin, ['date' => '2026-11-05', 'offs' => [['student_id' => $d['tanim']->id, 'meals' => ['dinner']]]])->assertStatus(422);
        $this->api('PUT', $host, "hostel/{$h['id']}/meals", $admin, ['date' => '2026-11-05', 'offs' => [['student_id' => $d['rafi']->id, 'meals' => ['dinner']]]])->assertOk();
        $this->api('PUT', $host, "hostel/{$h['id']}/meals", $admin, ['date' => '2026-11-06', 'offs' => [['student_id' => $d['rafi']->id, 'meals' => ['breakfast', 'lunch', 'dinner']]]])->assertOk();
        $this->api('PUT', $host, "hostel/{$h['id']}/meals", $admin, ['date' => '2026-11-06', 'offs' => [['student_id' => $d['rafi']->id, 'meals' => ['lunch', 'dinner']]]])->assertOk();   // re-marked: breakfast eaten

        $b1 = $this->api('POST', $host, "hostel/{$h['id']}/bazar", $admin, ['date' => '2026-11-01', 'amount' => '6000', 'note' => 'চাল ডাল'])->assertCreated()->json('data');
        $bad = $this->api('POST', $host, "hostel/{$h['id']}/bazar", $admin, ['date' => '2026-11-01', 'amount' => '999'])->assertCreated()->json('data');
        $this->api('POST', $host, "hostel/bazar/{$bad['id']}/reverse", $admin)->assertOk()->assertJsonPath('data.amount', '-999.00');
        $this->api('POST', $host, "hostel/bazar/{$bad['id']}/reverse", $admin)->assertStatus(409);
        $this->assertSame('6000.00', $this->api('GET', $host, "hostel/{$h['id']}/bazar", $admin, ['month' => '2026-11'])->json('data.total'));
        $this->assertSame(['6000.00', '999.00', '-999.00'], Tenancy::as($i, fn () => Expense::where('source', 'hostel_mess')->orderBy('id')->pluck('amount')->map(fn ($a) => (string) $a)->all()), 'expenses written and reversed, never deleted');

        $this->api('POST', $host, "hostel/{$h['id']}/mess/close", $admin, ['month' => '2026-11'])->assertStatus(422)->assertJsonValidationErrors('month');   // not over yet
        $this->travelTo('2026-12-01 09:00:00');
        Artisan::call('hostel:mess-close');
        $this->assertNull($this->api('GET', $host, "hostel/{$h['id']}/mess/bills", $admin, ['month' => '2026-11'])->json('data'), 'meal_rate waits for staff');
        $closed = $this->api('POST', $host, "hostel/{$h['id']}/mess/close", $admin, ['month' => '2026-11'])->assertOk()->json('data');

        // Rafi: breakfast 30-0 = 30 (x0.5 = 15), lunch 30-1 = 29, dinner 30-2 = 28 -> 72; Tanim: 10 days -> 5 + 10 + 10 = 25; total 97
        $bills = collect($this->api('GET', $host, "hostel/{$h['id']}/mess/bills", $admin, ['month' => '2026-11'])->json('data.rows'))->keyBy('student.name');
        $this->assertSame(['72.00', '25.00'], [$bills['Rafi']['meals'], $bills['Tanim']['meals']]);
        $this->assertSame(['4453.61', '1546.39'], [$bills['Rafi']['amount'], $bills['Tanim']['amount']], '6000 x 72/97 and 6000 x 25/97, half up');
        $this->assertSame('61.8557', $closed['meal_rate']);
        $this->api('POST', $host, "hostel/{$h['id']}/mess/close", $admin, ['month' => '2026-11'])->assertStatus(409);
        $this->api('POST', $host, "hostel/{$h['id']}/bazar", $admin, ['date' => '2026-11-30', 'amount' => '100'])->assertStatus(409);
        $this->api('PUT', $host, "hostel/{$h['id']}/meals", $admin, ['date' => '2026-11-10', 'offs' => [['student_id' => $d['rafi']->id, 'meals' => []]]])->assertStatus(409);

        $this->assertSame([['2026-11', '4453.61']], $this->messDues($i, $d['rafi']));
        $this->api('POST', $host, "hostel/mess-bills/{$bills['Rafi']['id']}/adjust", $admin, ['amount' => '-53.61', 'note' => 'রাউন্ডিং'])->assertCreated();
        $this->assertSame([['2026-11', '4400.00']], $this->messDues($i, $d['rafi']));
        $this->assertSame(3, Tenancy::as($i, fn () => HostelMessBill::count()), 'the bill stays; the adjustment is a new row');

        $parent = Tenancy::as($i, fn () => Student::find($d['rafi']->id)->parents()->first());
        $parent->forceFill(['must_change_password' => false])->save();
        $view = $this->api('GET', $host, "parent/children/{$d['rafi']->id}/hostel/mess", $parent)->assertOk()->json('data');
        $this->assertSame([true, '2026-11', '4400.00', true], [$view['with_mess'], $view['bills'][0]['month'], $view['bills'][0]['amount'], $view['bills'][0]['adjusted']]);
        $this->api('GET', $host, "parent/children/{$d['tanim']->id}/hostel/mess", $parent)->assertNotFound();
    }

    public function test_fixed_and_per_meal_modes_close_at_night_and_without_mess(): void
    {
        [$i, $admin, $d, $host, $h, $tanim] = $this->setUpHostel('mess2');
        $this->api('PUT', $host, "hostel/{$h['id']}/mess", $admin, ['mess_mode' => 'per_meal', 'breakfast_rate' => '30', 'lunch_rate' => '60', 'dinner_rate' => '50'])->assertOk();
        $this->api('PUT', $host, "hostel/allocations/{$tanim['id']}/mess", $admin, ['with_mess' => false])->assertOk();
        $this->api('PUT', $host, "hostel/{$h['id']}/meals", $admin, ['date' => '2026-11-10', 'offs' => [['student_id' => $d['rafi']->id, 'meals' => ['lunch']]]])->assertOk();
        $this->travelTo('2026-11-15 12:00:00');
        $sofar = $this->api('GET', $host, "hostel/{$h['id']}/mess", $admin)->assertOk()->json('data');
        $this->assertSame([1, 15, 14, 15], [$sofar['members'], $sofar['meals']['breakfast'], $sofar['meals']['lunch'], $sofar['meals']['dinner']], 'so far this month (1-15 Nov); Tanim is not a member');

        $this->travelTo('2026-12-01 01:00:00');
        Artisan::call('hostel:mess-close');
        Artisan::call('hostel:mess-close');   // once only
        $rows = $this->api('GET', $host, "hostel/{$h['id']}/mess/bills", $admin, ['month' => '2026-11'])->assertOk()->json('data.rows');
        $this->assertCount(1, $rows, 'Tanim had no mess');
        $this->assertSame('4140.00', $rows[0]['amount'], '30 x 30 + 29 x 60 + 30 x 50 = 900 + 1740 + 1500');

        // fixed monthly for December, closed on 1 January
        $this->api('PUT', $host, "hostel/{$h['id']}/mess", $admin, ['mess_mode' => 'fixed_monthly', 'mess_monthly_fee' => '3500'])->assertOk();
        $this->travelTo('2027-01-01 01:00:00');
        Artisan::call('hostel:mess-close');
        $this->assertSame(['3500.00'], array_column($this->api('GET', $host, "hostel/{$h['id']}/mess/bills", $admin, ['month' => '2026-12'])->json('data.rows'), 'amount'));
        $this->assertSame([['2026-11', '4140.00'], ['2026-12', '3500.00']], $this->messDues($i, $d['rafi']));
        $rafi = User::find(Tenancy::as($i, fn () => Student::find($d['rafi']->id)->user_id));
        $rafi->forceFill(['must_change_password' => false])->save();
        $this->assertCount(2, $this->api('GET', $host, 'student/hostel/mess', $rafi)->assertOk()->json('data.bills'));

        [$j, $otherAdmin, , $otherHost] = $this->setUpHostel('mess3');
        $this->api('POST', $otherHost, "hostel/{$h['id']}/mess/close", $otherAdmin, ['month' => '2026-12'])->assertNotFound();
        $this->api('POST', $otherHost, "hostel/mess-bills/{$rows[0]['id']}/adjust", $otherAdmin, ['amount' => '1', 'note' => 'x'])->assertNotFound();
    }
}

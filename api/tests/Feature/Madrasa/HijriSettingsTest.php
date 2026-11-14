<?php

namespace Tests\Feature\Madrasa;

use App\Models\Holiday;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D214 MAD.2: the secondary calendar is a display setting - off by default, the admin sets hijri and an offset of -2..+2 days,
// every signed-in role reads it; it never changes a stored date and never adds a holiday.
class HijriSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_setting_read_by_all_changed_by_the_admin_and_dates_untouched(): void
    {
        $i = $this->makeInstitution('hijri');
        $h = $this->hostOf($i);
        $admin = $this->makeUser($i, 'admin');
        $teacher = $this->makeUser($i, 'teacher');
        Tenancy::as($i, fn () => Holiday::create(['title' => 'Eid', 'date' => '2026-03-20']));

        $this->api('GET', $h, 'settings/calendar', $teacher)->assertOk()->assertJsonPath('data', ['secondary' => 'none', 'hijri_offset' => 0]);
        $this->api('PUT', $h, 'admin/settings/calendar', $teacher, ['secondary' => 'hijri', 'hijri_offset' => 0])->assertForbidden();
        $this->api('PUT', $h, 'admin/settings/calendar', $admin, ['secondary' => 'hijri', 'hijri_offset' => 3])->assertStatus(422);
        $this->api('PUT', $h, 'admin/settings/calendar', $admin, ['secondary' => 'lunar', 'hijri_offset' => 0])->assertStatus(422);
        $this->api('PUT', $h, 'admin/settings/calendar', $admin, ['secondary' => 'hijri', 'hijri_offset' => -1])->assertOk();
        $this->api('GET', $h, 'settings/calendar', $this->makeUser($i, 'parent'))->assertOk()->assertJsonPath('data', ['secondary' => 'hijri', 'hijri_offset' => -1]);

        Tenancy::as($i, function () {
            $this->assertSame(['2026-03-20'], Holiday::pluck('date')->map->toDateString()->all(), 'no stored date moved, no holiday added');
        });
        $this->assertSame(['secondary' => 'hijri', 'hijri_offset' => -1], $i->fresh()->settings['calendar']);
    }
}

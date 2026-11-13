<?php

namespace Tests\Feature\Leads;

use App\Models\AdmissionLead;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D204 GAP.2: the admin dashboard's admission card - open leads due today and website applications of the last 7 days, counts
// only (no names, no phones), only with the `leads` module; the leads list filters by source and since-date for the card's link.
class LeadDashboardTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_the_admission_card_counts_and_its_filters(): void
    {
        $this->travelTo('2030-07-10 10:00:00');
        $s = $this->school('ldash');
        $o = $this->school('ldash2');
        $mk = fn ($i, array $a) => Tenancy::as($i, fn () => AdmissionLead::create($a + ['phone' => '017' . random_int(10000000, 99999999), 'status' => 'new']));
        $mk($s['i'], ['name' => 'Due today', 'follow_up_date' => '2030-07-10', 'source' => 'walk_in']);
        $mk($s['i'], ['name' => 'Due but lost', 'follow_up_date' => '2030-07-10', 'status' => 'lost']);
        $mk($s['i'], ['name' => 'Due tomorrow', 'follow_up_date' => '2030-07-11']);
        $mk($s['i'], ['name' => 'Web new', 'source' => 'website']);
        $this->travelTo('2030-07-01 10:00:00');
        $mk($s['i'], ['name' => 'Web old', 'source' => 'website']);
        $this->travelTo('2030-07-10 10:00:00');
        $mk($o['i'], ['name' => 'Other web', 'source' => 'website', 'follow_up_date' => '2030-07-10']);

        $d = $this->api('GET', $s['host'], 'admin/dashboard', $s['admin'])->assertOk();
        $this->assertSame(['follow_up_today' => 1, 'website_7_days' => 1, 'today' => '2030-07-10', 'since' => '2030-07-03'], $d->json('data.leads'));
        foreach (['Due today', 'Web new', '017'] as $leak) $this->assertStringNotContainsString($leak, $d->getContent());

        // the card's links: today's follow-ups; website applications since that day
        $this->assertEqualsCanonicalizing(['Due today', 'Due but lost'], array_column($this->api('GET', $s['host'], 'leads?follow_up_date=2030-07-10', $s['admin'])->json('data'), 'name'));
        $this->assertSame(['Web new'], array_column($this->api('GET', $s['host'], 'leads?source=website&created_from=2030-07-03', $s['admin'])->json('data'), 'name'));
        $this->api('GET', $s['host'], 'leads?source=spam', $s['admin'])->assertStatus(422);

        // without the module there is no card
        $s['i']->forceFill(['enabled_modules' => ['leads' => false]])->save();
        $this->assertNull($this->api('GET', $s['host'], 'admin/dashboard', $s['admin'])->assertOk()->json('data.leads'));
    }
}

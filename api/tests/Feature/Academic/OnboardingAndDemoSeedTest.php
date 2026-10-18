<?php

namespace Tests\Feature\Academic;

use App\Models\{Batch, Enrollment, FeeCategory, Institution, Program, Student};
use App\Services\OnboardingService;
use App\Support\Tenancy;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Tests\TestCase;

// docs/modules/institution-types.md "Onboarding Defaults Per Type" + Step 2.5 Done When (three demo tenants)
class OnboardingAndDemoSeedTest extends TestCase
{
    use RefreshDatabase;

    public function test_onboarding_creates_the_type_defaults(): void
    {
        $expect = [
            'school'        => ['programs' => 10, 'batches' => 10, 'fees' => ['মাসিক বেতন' => 'monthly', 'পরীক্ষা ফি' => 'once', 'সেশন চার্জ' => 'yearly'], 'site' => true],
            'college'       => ['programs' => 6,  'batches' => 6,  'fees' => ['মাসিক বেতন' => 'monthly', 'সেশন ফি' => 'yearly', 'পরীক্ষা ফি' => 'once'], 'site' => true],
            'coaching'      => ['programs' => 0,  'batches' => 0,  'fees' => ['মাসিক ফি' => 'monthly', 'ভর্তি ফি' => 'once', 'কোর্স ফি' => 'once'], 'site' => true],
            'private_batch' => ['programs' => 1,  'batches' => 0,  'fees' => ['মাসিক ফি' => 'monthly'], 'site' => false],
        ];
        foreach ($expect as $type => $e) {
            $i = $this->makeInstitution("on-{$type}", $type);
            app(OnboardingService::class)->applyDefaults($i);
            app(OnboardingService::class)->applyDefaults($i->fresh());           // running twice creates nothing new

            Tenancy::as($i, function () use ($e, $type) {
                $this->assertSame($e['programs'], Program::count(), $type);
                $this->assertSame($e['batches'], Batch::count(), $type);
                $this->assertEquals($e['fees'], FeeCategory::pluck('frequency', 'name')->all(), $type);
            });
            $this->assertSame($e['site'], $i->fresh()->settings['public_site']['enabled'], $type);
            $this->assertTrue($i->fresh()->settings['platform_collect']);
        }
        $this->assertTrue(Tenancy::as(Institution::where('slug', 'on-private_batch')->first(), fn () => Program::first()->is_default));
    }

    public function test_the_demo_seed_creates_three_working_demo_tenants(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->withoutMiddleware(ThrottleRequests::class);

        $this->assertEqualsCanonicalizing(['dhanmondi-school', 'alokito-coaching', 'rahim-sir'], Institution::pluck('slug')->all());
        Tenancy::as(Institution::where('slug', 'alokito-coaching')->first(), function () {
            $this->assertSame(8, Student::count());
            $this->assertSame(11, Enrollment::where('status', 'active')->count(), 'three students sit in both batches');
            $this->assertSame('800.00', (string) Enrollment::where('fee_override', '>', 0)->value('fee_override'));
        });

        foreach ([['dhanmondi-school', 'principal@dhanmondischool.edu.bd', 'School@1234'], ['alokito-coaching', '01811111111', 'Coaching@1234'],
                  ['rahim-sir', '01911111111', 'Tutor@1234']] as [$slug, $login, $password]) {
            $this->api('POST', "{$slug}.schoolapp.com", 'auth/login', null, ['login' => $login, 'password' => $password])
                ->assertOk()->assertJsonPath('data.user.role', 'admin');
        }
        $this->api('GET', 'alokito-coaching.schoolapp.com', 'bootstrap')->assertJsonPath('data.theme.preset_key', 'modern-mint')
            ->assertJsonPath('data.terms.batch.bn', 'ব্যাচ');
        $this->assertFalse(app()->bound('currentInstitution'), 'no seeder left a tenant bound');
    }
}

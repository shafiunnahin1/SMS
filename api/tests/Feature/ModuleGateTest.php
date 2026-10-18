<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\Student;
use App\Models\SubscriptionPlan;
use App\Services\ModuleGate;
use Database\Seeders\PlanSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

// docs/modules/institution-types.md "Module Gate", adjusted by D47: no plan decides whether a module is on.
// `hostel` is not in Release 1, so these tests simulate a later release that ships it (the release gate itself: ReleaseGateTest).
class ModuleGateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PlanSeeder::class);
        config(['release.modules' => [...config('release.modules'), 'hostel', 'hifz']]);
        Route::middleware(['tenant', 'module:hostel'])->get('api/v1/test/hostel', fn () => response()->json(['ok' => true]));
    }

    private function institution(string $slug, string $type, string $plan, array $extra = []): Institution
    {
        return Institution::create(['name' => $slug, 'slug' => $slug, 'institution_type' => $type, 'status' => 'active',
            'subscription_plan_id' => SubscriptionPlan::where('name', $plan)->value('id')] + $extra);
    }

    public function test_a_module_the_type_does_not_include_is_403_module_disabled(): void
    {
        $coaching = $this->institution('alokito', 'coaching', 'Enterprise');

        $this->api('GET', $this->hostOf($coaching), 'test/hostel')->assertForbidden()->assertJson(['error' => 'module_disabled', 'module' => 'hostel']);
    }

    public function test_d47_no_plan_gates_a_module_basic_and_enterprise_schools_both_get_it(): void
    {
        $basic = $this->institution('basic-school', 'school', 'Basic');           // Basic plan: features.hostel = false
        $enterprise = $this->institution('big-school', 'school', 'Enterprise');

        $this->assertFalse(SubscriptionPlan::where('name', 'Basic')->first()->features['hostel']);
        $this->api('GET', $this->hostOf($basic), 'test/hostel')->assertOk();
        $this->api('GET', $this->hostOf($enterprise), 'test/hostel')->assertOk();
    }

    public function test_the_super_admin_override_wins_in_both_directions(): void
    {
        $coaching = $this->institution('alokito', 'coaching', 'Coaching', ['enabled_modules' => ['hostel' => true]]);
        $school = $this->institution('dhanmondi', 'school', 'Enterprise', ['enabled_modules' => ['hostel' => false]]);

        $this->api('GET', $this->hostOf($coaching), 'test/hostel')->assertOk();
        $this->api('GET', $this->hostOf($school), 'test/hostel')->assertForbidden()->assertJson(['error' => 'module_disabled']);
    }

    public function test_opt_in_modules_stay_off_until_the_institution_turns_them_on(): void
    {
        $gate = app(ModuleGate::class);
        $school = $this->institution('madrasa', 'school', 'Basic');
        $coaching = $this->institution('alokito', 'coaching', 'Coaching', ['settings' => ['opt_in_modules' => ['hifz']]]);

        $this->assertFalse($gate->allows($school, 'hifz'));
        $school->update(['settings' => ['opt_in_modules' => ['hifz']]]);
        $this->assertTrue($gate->allows($school->fresh(), 'hifz'));
        $this->assertFalse($gate->allows($coaching, 'hifz'), 'opting in cannot add a module the type does not include');
    }

    public function test_enabled_modules_matches_allows_for_every_module(): void
    {
        $gate = app(ModuleGate::class);
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            $i = $this->institution("t-{$type}", $type, 'Basic', ['enabled_modules' => ['sms' => false]]);
            $all = collect(config('institution_types'))->except('opt_in')->pluck('modules')->flatten()->unique();
            $expected = $all->filter(fn ($m) => $gate->allows($i, $m))->values()->all();

            $this->assertSame($expected, $gate->enabledModules($i));
            $this->assertNotContains('sms', $gate->enabledModules($i));
            $this->assertContains('students', $gate->enabledModules($i));
        }
    }

    public function test_feature_flags_follow_the_override(): void
    {
        $gate = app(ModuleGate::class);
        $i = $this->institution('flags', 'school', 'Basic', ['enabled_modules' => ['custom_branding' => true]]);

        $this->assertTrue($gate->feature($i, 'custom_branding'));
        $this->assertFalse($gate->feature($i, 'white_label'));

        Route::middleware(['tenant', 'feature:white_label'])->get('api/v1/test/white-label', fn () => response()->json(['ok' => true]));
        $this->api('GET', $this->hostOf($i), 'test/white-label')->assertForbidden()->assertJson(['error' => 'feature_not_available']);
    }

    public function test_d47_subscription_check_has_no_student_or_batch_limit(): void
    {
        $school = $this->institution('tiny', 'school', 'Tutor');                   // Tutor plan: max_students 100, max_batches 10
        SubscriptionPlan::where('name', 'Tutor')->update(['max_students' => 1, 'max_batches' => 1]);
        $this->asTenant($school, function () {
            foreach (['S-1', 'S-2'] as $code) Student::create(['student_id' => $code, 'guardian_phone' => '01700000000']);
        });
        $admin = $this->makeUser($school, 'admin');
        Route::middleware(['tenant', 'auth:sanctum', 'tenant.user', 'subscription'])->post('api/v1/test/students', fn () => response()->json(['ok' => true]))->name('students.store');

        $this->api('POST', $this->hostOf($school), 'test/students', $admin)->assertOk();
    }

    public function test_an_expired_subscription_blocks_everything_but_auth_subscription_and_billing(): void
    {
        $school = $this->institution('late', 'school', 'Basic', ['subscription_expires_at' => now()->subDays(4)]);
        $admin = $this->makeUser($school, 'admin');
        foreach (['test/anything', 'auth/me', 'subscription'] as $path) {
            Route::middleware(['tenant', 'auth:sanctum', 'tenant.user', 'subscription'])->get("api/v1/{$path}", fn () => response()->json(['ok' => true]));
        }

        $this->api('GET', $this->hostOf($school), 'test/anything', $admin)->assertForbidden()->assertJson(['error' => 'subscription_expired']);
        $this->api('GET', $this->hostOf($school), 'auth/me', $admin)->assertOk();
        $this->api('GET', $this->hostOf($school), 'subscription', $admin)->assertOk();

        $school->update(['subscription_expires_at' => now()->subDays(2)]);             // inside the 3-day grace
        $this->api('GET', $this->hostOf($school), 'test/anything', $admin)->assertOk();
    }
}

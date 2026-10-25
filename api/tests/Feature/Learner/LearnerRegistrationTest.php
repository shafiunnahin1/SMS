<?php

namespace Tests\Feature\Learner;

use App\Models\{Institution, LearnerProfile, OtpToken, QbClassLevel, User};
use App\Services\Auth\OtpService;
use App\Services\Learner\LearnerRegistrationService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D165 (1) ST.1: a student registers on the central host with their own mobile (no guardian, no age), the account lives in the
// platform `learners` institution and is inactive until the mobile code is entered; then they log in on learn.<base> and set
// their class. A number with an active account is refused; a pending one is replaced. Only the learners host has a profile.
class LearnerRegistrationTest extends TestCase
{
    use RefreshDatabase;

    private function central(): string { return (string) (config('tenancy.central_domains')[0] ?? config('tenancy.base_domain')); }

    private function register(array $over = []): \Illuminate\Testing\TestResponse
    {
        $class = QbClassLevel::firstOrCreate(['name_bn' => 'অষ্টম শ্রেণি'], ['name_en' => 'Class 8', 'education_level' => 'secondary', 'is_active' => true]);
        return $this->postJson('http://' . $this->central() . '/api/v1/public/learners', array_replace(['name' => 'Rafi', 'phone' => '01712345678',
            'password' => 'Learner@2026', 'password_confirmation' => 'Learner@2026', 'qb_class_level_id' => $class->id, 'accept_terms' => true], $over));
    }

    /** the code the service sent, read back the way the user would: issue a known one through the same OTP service */
    private function knownCode(int $userId): string
    {
        return Tenancy::as(LearnerRegistrationService::institution(), function () use ($userId) {
            [, $code] = app(OtpService::class)->issue(User::inTenant()->findOrFail($userId), LearnerRegistrationService::OTP);
            return $code;
        });
    }

    public function test_register_verify_login_and_profile(): void
    {
        $r = $this->register()->assertCreated()->json('data');
        $this->assertSame('017******78', $r['phone']);
        $learners = Institution::where('institution_type', 'learners')->sole();
        $this->assertSame('learn', $learners->slug);
        $user = Tenancy::as($learners, fn () => User::inTenant()->findOrFail($r['id']));
        $this->assertSame(['student', false, '01712345678'], [$user->role, (bool) $user->is_active, $user->phone]);

        $host = LearnerRegistrationService::host();
        $this->postJson("http://{$host}/api/v1/auth/login", ['login' => '01712345678', 'password' => 'Learner@2026'])->assertStatus(401);   // not verified yet

        $this->postJson('http://' . $this->central() . "/api/v1/public/learners/{$r['id']}/verify", ['code' => '000000x'])->assertStatus(422);
        $this->postJson('http://' . $this->central() . "/api/v1/public/learners/{$r['id']}/verify", ['code' => $this->knownCode($r['id'])])
            ->assertOk()->assertJsonPath('data.login_host', $host);
        $this->postJson('http://' . $this->central() . "/api/v1/public/learners/{$r['id']}/verify", ['code' => '123456'])->assertNotFound();   // already verified

        $this->postJson("http://{$host}/api/v1/auth/login", ['login' => '01712345678', 'password' => 'Learner@2026'])->assertOk();
        $me = $user->fresh();
        $this->api('GET', $host, 'learner/profile', $me)->assertOk()->assertJsonPath('data.class_level.name_en', 'Class 8');
        $nine = QbClassLevel::create(['name_bn' => 'নবম শ্রেণি', 'name_en' => 'Class 9', 'education_level' => 'secondary', 'is_active' => true]);
        $this->api('PUT', $host, 'learner/profile', $me, ['qb_class_level_id' => $nine->id])->assertOk()->assertJsonPath('data.qb_class_level_id', $nine->id);
        $this->assertSame($nine->id, Tenancy::as($learners, fn () => LearnerProfile::where('user_id', $me->id)->value('qb_class_level_id')));

        $this->register(['name' => 'Other'])->assertStatus(422)->assertJsonPath('error', 'learner_phone_taken');
    }

    public function test_pending_is_replaced_validation_and_class_editable_only_on_the_learners_host(): void
    {
        $a = $this->register()->assertCreated()->json('data.id');
        $b = $this->register(['name' => 'Rafi Ahmed', 'phone' => '+8801712345678'])->assertCreated()->json('data.id');
        $this->assertSame($a, $b, 'a pending registration is replaced, not duplicated');
        $this->assertSame('Rafi Ahmed', Tenancy::as(LearnerRegistrationService::institution(), fn () => User::inTenant()->findOrFail($a)->name));
        $this->assertSame(1, Tenancy::as(LearnerRegistrationService::institution(), fn () => OtpToken::where('user_id', $a)->whereNull('used_at')->count()), 'the older code stops working');

        $this->register(['phone' => '12345', 'accept_terms' => false, 'password_confirmation' => 'x'])->assertStatus(422)
            ->assertJsonValidationErrors(['phone', 'accept_terms', 'password']);

        $school = $this->makeInstitution('lrnschool', 'school');
        $this->api('GET', $this->hostOf($school), 'learner/profile', $this->makeUser($school, 'student'))->assertOk()->assertJsonPath('data.class_editable', false);   // ST.5: an institution's student - batch only
        $this->api('GET', LearnerRegistrationService::host(), 'learner/profile')->assertUnauthorized();
        $this->getJson('http://' . $this->central() . '/api/v1/public/learners/class-levels')->assertOk()->assertJsonPath('data.0.name_en', 'Class 8');
    }

    public function test_no_other_institution_takes_the_learners_slug_or_type(): void
    {
        $this->assertSame('learn', config('tenancy.learners_slug'));
        $super = $this->makeUser(null, 'super_admin');
        $this->api('POST', 'admin.' . config('tenancy.base_domain'), 'super/institutions', $super, ['name' => 'X', 'slug' => 'learn', 'institution_type' => 'school'])
            ->assertStatus(422)->assertJsonValidationErrors(['slug']);
        $this->api('POST', 'admin.' . config('tenancy.base_domain'), 'super/institutions', $super, ['name' => 'X', 'slug' => 'lrnx', 'institution_type' => 'learners'])
            ->assertStatus(422)->assertJsonValidationErrors(['institution_type']);
        $this->assertSame(['question_bank', 'quiz'], config('institution_types.learners.modules'));
        $this->assertSame(['student'], config('institution_types.learners.roles'));
    }
}

<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Rules\PolicyPassword;
use Illuminate\Support\Facades\Validator;

// docs/AUTHORIZATION.md "Password Policy (Revision 7 - role-based)"
class PasswordPolicyTest extends AuthTestCase
{
    private function ok(User|string $who, string $password): bool
    {
        return Validator::make(['p' => $password], ['p' => [new PolicyPassword($who)]])->passes();
    }

    public function test_minimum_length_depends_on_the_role(): void
    {
        foreach (['super_admin' => 12, 'admin' => 10, 'accountant' => 10, 'teacher' => 8, 'student' => 6, 'parent' => 6] as $role => $min) {
            $this->assertFalse($this->ok($role, 'x7' . str_repeat('k', $min - 3)), "{$role}: " . ($min - 1) . ' chars must fail');
            $this->assertTrue($this->ok($role, 'x7' . str_repeat('k', $min - 2)), "{$role}: {$min} chars must pass");
        }
    }

    public function test_staff_need_letters_and_digits_students_and_parents_do_not(): void
    {
        $this->assertFalse($this->ok('teacher', 'onlyletters'));
        $this->assertFalse($this->ok('admin', '7395021846'));
        $this->assertTrue($this->ok('teacher', 'river7lamp'));
        $this->assertTrue($this->ok('parent', 'kodomphul'), 'letters only is fine for a parent');
        $this->assertTrue($this->ok('student', '739502'), 'digits only is fine for a student');
        $this->assertTrue($this->ok('parent', 'আমারবাড়ি'), 'Bengali letters count as letters');
        $this->assertFalse($this->ok('teacher', 'বাংলাদেশসোনা'), 'still needs a digit');
        $this->assertTrue($this->ok('teacher', 'বাংলাদেশ২০২৬x9'));
    }

    public function test_a_special_character_is_never_required(): void
    {
        $this->assertTrue($this->ok('super_admin', 'longpassword47x'));
    }

    public function test_the_users_own_name_phone_email_or_id_is_refused(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $u = $this->user($school, 'teacher', ['name' => 'Rahima', 'email' => 'rahima.k@d.test', 'phone' => '01712345678', 'username' => 'T-2025-9']);

        $this->assertFalse($this->ok($u, 'rahima2026x'));
        $this->assertFalse($this->ok($u, 'x01712345678'));
        $this->assertFalse($this->ok($u, 'rahima.k@d.test1'));
        $this->assertFalse($this->ok($u, 'T-2025-9abc1'));
        $this->assertTrue($this->ok($u, 'jamun7pukur'));
    }

    public function test_common_passwords_are_refused_whatever_the_case(): void
    {
        $this->assertGreaterThan(1000, count(PolicyPassword::commonPasswords()));
        foreach (['123456', 'password', 'qwerty123', 'Bangladesh123', 'iloveyou1', '1111111111'] as $common) {
            $this->assertFalse($this->ok('parent', $common), $common);
        }
    }

    public function test_change_password_applies_the_policy(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $u = $this->user($school, 'admin', ['email' => 'a@d.test']);
        $token = app(\App\Services\Auth\TokenService::class)->issue($u, request());
        $change = fn (string $pw, string $current = self::PASSWORD) => $this->callWithToken('PATCH', $this->hostOf($school), 'auth/change-password', $token,
            ['current_password' => $current, 'password' => $pw, 'password_confirmation' => $pw]);

        $change('short7')->assertStatus(422)->assertJsonValidationErrors(['password']);
        $change('Fine-pass-2026', 'wrong-current')->assertStatus(422)->assertJsonValidationErrors(['current_password']);
        $change(self::PASSWORD)->assertStatus(422)->assertJsonValidationErrors(['password']);
        $change('Fine-pass-2026')->assertOk();
    }
}

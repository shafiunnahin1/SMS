<?php

namespace Tests\Feature\Auth;

use Laravel\Sanctum\PersonalAccessToken;

// docs/TESTING.md "ReleaseRolesTest": a role config/release.php does not ship cannot log in. D68: R1 ships student login, so the
// unshipped case runs with a role taken out of the list (every role in the schema ships in R1 now).
class ReleaseRolesTest extends AuthTestCase
{
    public function test_an_unshipped_role_gets_403_role_not_available_and_no_token(): void
    {
        config(['release.roles' => array_values(array_diff(config('release.roles'), ['student']))]);
        $school = $this->makeInstitution('dhanmondi');
        $this->user($school, 'student', ['username' => 'DHA-2025-0001']);

        $this->login($this->hostOf($school), 'DHA-2025-0001')->assertForbidden()
            ->assertJson(['error' => 'role_not_available'])->assertJsonMissingPath('data.token');
        $this->assertSame(0, PersonalAccessToken::count());
    }

    public function test_a_wrong_password_for_an_unshipped_role_still_gives_the_generic_answer(): void
    {
        config(['release.roles' => array_values(array_diff(config('release.roles'), ['student']))]);
        $school = $this->makeInstitution('dhanmondi');
        $this->user($school, 'student', ['username' => 'DHA-2025-0001']);

        $this->login($this->hostOf($school), 'DHA-2025-0001', 'not-the-password')->assertUnauthorized()->assertJson(['error' => 'invalid_credentials']);
    }

    public function test_every_shipped_role_can_log_in(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        foreach (['admin', 'teacher', 'accountant', 'parent'] as $role) {
            $this->user($school, $role, ['email' => "{$role}@d.test"]);
            $this->login($this->hostOf($school), "{$role}@d.test")->assertOk();
        }
        $this->user($school, 'student', ['username' => 'DHA-2025-0001']);
        $this->login($this->hostOf($school), 'DHA-2025-0001')->assertOk()->assertJsonStructure(['data' => ['token']]);   // D68
    }
}

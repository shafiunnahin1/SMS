<?php
namespace Tests\Feature\Auth;

use App\Models\{AccountActivationRequest, Institution, User};
use App\Services\Auth\{ActivationDelivery, StaffAccountService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class StaffActivationConcurrencyTest extends TestCase
{
    use DatabaseMigrations;
    protected function afterRefreshingDatabase()
    {
        Storage::fake('private'); Storage::fake('public');
        // Registered before DatabaseMigrations' rollback callback. Dispose this test's committed tenant first:
        // the historical QB rollback intentionally cannot narrow an enum containing live institution_staff rows.
        $this->beforeApplicationDestroyed(function () {
            if (DB::connection()->getDatabaseName() !== 'edu_saas_test') throw new \LogicException('Test database required');
            $i = Institution::where('slug', 'staff-race')->first();
            if (!$i) return;
            $super = $this->makeUser(null, 'super_admin');
            $i->forceFill(['status' => 'expired', 'subscription_expires_at' => now()->subDays(40)])->save();
            app(\App\Services\Privacy\TenantPurgeService::class)->execute($i, $super->id);
        });
    }
    private function fixture(): array
    {
        $this->assertSame('edu_saas_test', DB::connection()->getDatabaseName());
        $delivery = new class extends ActivationDelivery {
            public string $code = '';
            public function deliver(string $channel, string $contact, string $code, array $tracking): bool { $this->code = $code; return true; }
        };
        app()->instance(ActivationDelivery::class, $delivery);
        $i = $this->makeInstitution('staff-race'); $admin = $this->makeUser($i, 'admin');
        $result = Tenancy::as($i, fn () => app(StaffAccountService::class)->create($admin,
            ['name' => 'Race fixture', 'contact' => ['channel' => 'phone', 'value' => '01712345678']]));
        return $result['activation'] + ['user_id' => $result['user']->id, 'actor_id' => $admin->id, 'code' => $delivery->code, 'password' => 'Private-secret-42'];
    }
    private function race(array $input, array $modes): array
    {
        $directory = sys_get_temp_dir().'/school-staff-race-'.bin2hex(random_bytes(8)); mkdir($directory);
        $processes = [];
        try {
            DB::beginTransaction(); Institution::whereKey($input['institution_id'])->lockForUpdate()->firstOrFail();
            foreach ($modes as $slot => $mode) {
                $p = new Process([PHP_BINARY, base_path('tests/Support/StaffActivationWorker.php')], base_path(),
                    ['APP_ENV' => 'testing', 'DB_DATABASE' => 'edu_saas_test', 'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array', 'MAIL_MAILER' => 'array']);
                $p->setTimeout(25); $p->setInput(json_encode($input + ['barrier' => $directory, 'slot' => $slot, 'mode' => $mode], JSON_THROW_ON_ERROR));
                $p->start(); $processes[] = $p;
            }
            $deadline = microtime(true) + 15;
            while (!is_file($directory.'/0.ready') || !is_file($directory.'/1.ready')) {
                if (microtime(true) > $deadline) $this->fail('Staff workers did not reach the barrier');
                foreach ($processes as $p) if (!$p->isRunning()) $this->fail('Staff worker stopped before barrier');
                usleep(10000);
            }
            file_put_contents($directory.'/go', 'go'); usleep(150000);
            foreach ($processes as $p) $this->assertTrue($p->isRunning(), 'Staff mutation bypassed the institution lock');
            DB::commit(); $results = [];
            foreach ($processes as $p) {
                $this->assertSame(0, $p->wait(), $p->getErrorOutput());
                $results[] = json_decode($p->getOutput(), true, flags: JSON_THROW_ON_ERROR);
            }
            return $results;
        } finally {
            if (DB::transactionLevel()) DB::rollBack();
            foreach ($processes as $p) if ($p->isRunning()) $p->stop();
            foreach (['0.ready', '1.ready', 'go'] as $file) if (is_file($directory.'/'.$file)) unlink($directory.'/'.$file);
            rmdir($directory);
        }
    }
    public function test_parallel_activation_consumes_one_principal_authorized_request_exactly_once(): void
    {
        $input = $this->fixture(); $results = $this->race($input, ['activate', 'activate']);
        $this->assertSame(1, count(array_filter($results, fn ($r) => ($r['status'] ?? null) === 'consumed')));
        $this->assertSame(1, count(array_filter($results, fn ($r) => ($r['error'] ?? null) === 'activation_invalid')));
        $user = User::findOrFail($input['user_id']); $this->assertTrue($user->is_active); $this->assertSame(0, $user->tokens()->count());
    }
    public function test_parallel_principal_deactivation_wins_over_an_old_invitation_in_either_order(): void
    {
        $input = $this->fixture(); $results = $this->race($input, ['activate', 'deactivate']);
        $this->assertSame('inactive', $results[1]['status']);
        $user = User::findOrFail($input['user_id']); $this->assertFalse($user->is_active); $this->assertSame(0, $user->tokens()->count());
        Tenancy::as(Institution::findOrFail($input['institution_id']), function () use ($input) {
            $this->assertContains(AccountActivationRequest::sole()->status, ['cancelled', 'consumed']);
            try {
                app(StaffAccountService::class)->activate($input['public_id'], $input['code'], ['password' => $input['password'], 'password_confirmation' => $input['password']]);
                $this->fail('Old invitation reactivated a manually deactivated account');
            } catch (\App\Exceptions\BusinessException $e) { $this->assertSame('activation_invalid', $e->errorCode); }
        });
    }
}

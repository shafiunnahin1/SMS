<?php

namespace Tests\Feature\Auth;

use App\Models\{AccountActivationRequest, Institution, OtpToken, User};
use App\Services\Auth\{ActivationDelivery, PrincipalProvisioningService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class PrincipalActivationConcurrencyTest extends TestCase
{
    use DatabaseMigrations;

    public function test_two_real_connections_wait_for_the_institution_lock_and_consume_the_code_once(): void
    {
        $this->assertSame('edu_saas_test', DB::connection()->getDatabaseName());
        $delivery = new class extends ActivationDelivery {
            public string $code = '';
            public function send(string $channel, string $contact, string $code): bool { $this->code = $code; return true; }
        };
        app()->instance(ActivationDelivery::class, $delivery);
        $state = app(PrincipalProvisioningService::class)->provision(
            ['name' => 'Race fixture', 'slug' => 'race-principal', 'institution_type' => 'school'],
            ['name' => 'Principal fixture', 'contact' => ['channel' => 'phone', 'value' => '01712345678'],
                'password' => 'Private-secret-42', 'password_confirmation' => 'Private-secret-42']);
        $this->assertNotSame('', $delivery->code);
        $directory = sys_get_temp_dir().'/school-principal-race-'.bin2hex(random_bytes(8));
        mkdir($directory);
        $processes = [];
        try {
            DB::beginTransaction();
            Institution::whereKey($state['institution_id'])->lockForUpdate()->firstOrFail();
            foreach (['a', 'b'] as $slot) {
                $process = new Process([PHP_BINARY, base_path('tests/Support/PrincipalActivationWorker.php')], base_path(),
                    ['APP_ENV' => 'testing', 'DB_DATABASE' => 'edu_saas_test', 'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array', 'MAIL_MAILER' => 'array']);
                $process->setTimeout(25);
                $process->setInput(json_encode($state + ['code' => $delivery->code, 'barrier' => $directory, 'slot' => $slot], JSON_THROW_ON_ERROR));
                $process->start();
                $processes[$slot] = $process;
            }
            $deadline = microtime(true) + 15;
            while (!is_file($directory.'/a.ready') || !is_file($directory.'/b.ready')) {
                if (microtime(true) > $deadline) $this->fail('Workers did not reach the barrier');
                foreach ($processes as $process) if (!$process->isRunning()) $this->fail('Worker stopped before the barrier');
                usleep(10000);
            }
            file_put_contents($directory.'/go', 'go');
            usleep(150000);
            foreach ($processes as $process) $this->assertTrue($process->isRunning(), 'Verification completed while the institution was locked');
            DB::commit();
            $outcomes = [];
            foreach ($processes as $process) {
                $this->assertSame(0, $process->wait(), $process->getErrorOutput());
                $outcomes[] = json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
            }
            $this->assertSame(1, count(array_filter($outcomes, fn ($r) => ($r['status'] ?? null) === 'verified')));
            $this->assertSame(1, count(array_filter($outcomes, fn ($r) => ($r['error'] ?? null) === 'activation_invalid')));
            $i = Institution::findOrFail($state['institution_id']);
            $request = Tenancy::as($i, fn () => AccountActivationRequest::sole());
            $this->assertSame('verified', $request->status);
            $this->assertNotNull(OtpToken::findOrFail($request->otp_token_id)->used_at);
            $this->assertSame('inactive', $i->status);
            $this->assertFalse(User::where('institution_id', $i->id)->sole()->is_active);
        } finally {
            if (DB::transactionLevel()) DB::rollBack();
            foreach ($processes as $process) if ($process->isRunning()) $process->stop();
            foreach (['a.ready', 'b.ready', 'go'] as $file) if (is_file($directory.'/'.$file)) unlink($directory.'/'.$file);
            rmdir($directory);
        }
    }
}

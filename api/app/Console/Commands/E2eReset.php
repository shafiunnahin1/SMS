<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

// docs/E2E-TESTING.md section 6: restore the three demo tenants before an E2E spec file. Exists ONLY when APP_ENV=testing - in any
// other environment Symfony does not register a disabled command, so `php artisan e2e:reset` is "command not found" (G13).
class E2eReset extends Command
{
    protected $signature = 'e2e:reset';

    protected $description = 'Testing only: rebuild the database with the demo tenants for the browser tests';

    public function isEnabled(): bool
    {
        return $this->laravel->environment('testing');
    }

    public function handle(): int
    {
        if (!$this->isEnabled()) {                     // belt and braces: never wipe a non-test database
            $this->error('e2e:reset runs only with APP_ENV=testing');
            return self::FAILURE;
        }
        $this->call('migrate:fresh', ['--seed' => true, '--force' => true]);
        $this->info('demo tenants restored');
        return self::SUCCESS;
    }
}

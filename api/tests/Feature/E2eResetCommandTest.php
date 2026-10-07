<?php

namespace Tests\Feature;

use App\Console\Commands\E2eReset;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

// docs/E2E-TESTING.md section 6: `e2e:reset` exists only when APP_ENV=testing and never wipes another database
class E2eResetCommandTest extends TestCase
{
    public function test_the_command_is_registered_only_in_testing(): void
    {
        $this->assertArrayHasKey('e2e:reset', Artisan::all());
        foreach (['local', 'production', 'staging'] as $env) {
            $this->app['env'] = $env;
            $command = $this->app->make(E2eReset::class);
            $command->setLaravel($this->app);
            $this->assertFalse($command->isEnabled(), $env);
        }
        $this->app['env'] = 'testing';
    }

    public function test_it_refuses_to_run_outside_testing(): void
    {
        $this->app['env'] = 'production';
        $command = $this->app->make(E2eReset::class);
        $command->setLaravel($this->app);
        $code = $command->run(new \Symfony\Component\Console\Input\ArrayInput([]), new \Symfony\Component\Console\Output\BufferedOutput());
        $this->assertSame(1, $code);
        $this->app['env'] = 'testing';
    }
}

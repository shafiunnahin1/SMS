<?php

namespace Tests\Unit\Pdf;

use App\Services\PdfService;
use PHPUnit\Framework\TestCase;

// Owner's PC 2026-10-24: under `php -S` on Windows, chrome-php's launcher handed Chrome only the variables also in $_SERVER (the
// request and .env values), so Chrome could not start. PdfService passes Chrome the OS variables it needs, and never .env secrets.
class ChromeEnvTest extends TestCase
{
    private array $env = ['SystemRoot' => 'C:\\Windows', 'TEMP' => 'C:\\Users\\u\\AppData\\Local\\Temp', 'LOCALAPPDATA' => 'C:\\Users\\u\\AppData\\Local',
        'Path' => 'C:\\Windows\\system32', 'ProgramFiles(x86)' => 'C:\\Program Files (x86)', 'DB_PASSWORD' => 'secret', 'APP_KEY' => 'base64:x', 'HTTP_COOKIE' => 'a=b'];

    public function test_a_windows_web_request_gives_chrome_the_os_variables_only(): void
    {
        $env = PdfService::chromeEnv($this->env, 'Windows', 'cli-server');
        $this->assertSame(['SystemRoot', 'TEMP', 'LOCALAPPDATA', 'Path', 'ProgramFiles(x86)'], array_keys($env));
        $this->assertArrayNotHasKey('DB_PASSWORD', $env);
        $this->assertArrayNotHasKey('APP_KEY', $env);
        $this->assertArrayNotHasKey('HTTP_COOKIE', $env);
    }

    public function test_cli_and_other_systems_keep_the_library_default(): void
    {
        $this->assertNull(PdfService::chromeEnv($this->env, 'Windows', 'cli'));
        $this->assertNull(PdfService::chromeEnv($this->env, 'Linux', 'fpm-fcgi'));
        $this->assertNull(PdfService::chromeEnv($this->env, 'Linux', 'cli-server'));
    }
}

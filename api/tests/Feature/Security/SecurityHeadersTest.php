<?php

namespace Tests\Feature\Security;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/ops/security-checklist.md: security headers (HSTS over https) and CORS limited to the platform's own domains (docs/SECURITY.md)
class SecurityHeadersTest extends TestCase
{
    use RefreshDatabase;

    public function test_security_headers_and_hsts_only_over_https(): void
    {
        $i = $this->makeInstitution('hdr');
        $plain = $this->getJson('http://' . $this->hostOf($i) . '/api/v1/auth/me');
        $plain->assertHeader('X-Content-Type-Options', 'nosniff')->assertHeader('X-Frame-Options', 'DENY')->assertHeader('Referrer-Policy');
        $this->assertFalse($plain->headers->has('Strict-Transport-Security'));
        $this->getJson('https://' . $this->hostOf($i) . '/api/v1/auth/me')->assertHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    public function test_cors_allows_only_the_platforms_own_domains(): void
    {
        $host = $this->hostOf($this->makeInstitution('cors'));
        $base = config('tenancy.base_domain');
        $ask = fn (string $origin) => $this->call('OPTIONS', "https://{$host}/api/v1/auth/login", [], [], [], [
            'HTTP_ORIGIN' => $origin, 'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST', 'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'content-type']);
        $this->assertSame("https://{$host}", $ask("https://{$host}")->headers->get('Access-Control-Allow-Origin'));
        $this->assertSame("https://admin.{$base}", $ask("https://admin.{$base}")->headers->get('Access-Control-Allow-Origin'));
        foreach (['https://evil.test', "https://{$base}.evil.test", "https://evil{$base}"] as $origin) {
            $this->assertNull($ask($origin)->headers->get('Access-Control-Allow-Origin'), $origin);
        }
    }

    public function test_the_local_disk_upload_route_refuses_an_unsigned_put(): void
    {
        \Illuminate\Support\Facades\Storage::fake('private');
        $host = $this->hostOf($this->makeInstitution('put'));
        $res = $this->call('PUT', "http://{$host}/storage/institutions/1/students/1/x.php", [], [], [], [], '<?php echo 1;');
        $this->assertContains($res->getStatusCode(), [403, 404]);
        \Illuminate\Support\Facades\Storage::disk('private')->assertMissing('institutions/1/students/1/x.php');
    }
}

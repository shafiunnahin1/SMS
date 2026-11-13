<?php

namespace Tests\Feature\PublicSite;

use App\Models\Notice;
use App\Services\DomainService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D202 PUB.4 (docs/modules/public-website.md "Tests" PublicShellTest): the first load of the public paths carries the institution's
// title, description, canonical (always the primary URL) and Open Graph tags, every value escaped; a site that is off says
// noindex; the central host and unknown hosts get the built index.html unchanged; robots.txt and sitemap.xml follow the site.
class PublicShellTest extends TestCase
{
    use RefreshDatabase;

    private const SHELL = '<!doctype html><html lang="bn"><head><meta charset="UTF-8"><title>Education Management</title></head><body><div id="root"></div></body></html>';
    private string $file;

    protected function setUp(): void
    {
        parent::setUp();
        $this->file = tempnam(sys_get_temp_dir(), 'shell');
        file_put_contents($this->file, self::SHELL);
        config(['app.public_shell_path' => $this->file]);
    }

    protected function tearDown(): void
    {
        @unlink($this->file);
        parent::tearDown();
    }

    private function at(string $host, string $path) { return $this->get("http://{$host}{$path}"); }

    public function test_tenant_pages_carry_the_institutions_tags_escaped(): void
    {
        $i = $this->makeInstitution('shellsch');
        $i->forceFill(['name' => 'Rose <script>alert(1)</script> School', 'settings' => ['public_site' => ['enabled' => true, 'about' => "Since 1990.\n\nA \"good\" school."]]])->save();
        $h = $this->hostOf($i);
        $canon = app(DomainService::class)->primaryUrl($i);

        $home = $this->at($h, '/')->assertOk()->assertHeader('Content-Type', 'text/html; charset=utf-8');
        $html = $home->getContent();
        $this->assertStringNotContainsString('<script>alert(1)</script>', $html);
        $this->assertStringContainsString('<title>Rose &lt;script&gt;alert(1)&lt;/script&gt; School</title>', $html);
        $this->assertStringContainsString("<link rel=\"canonical\" href=\"{$canon}/\">", $html);
        $this->assertStringContainsString('<meta name="description" content="Since 1990. A &quot;good&quot; school.">', $html);
        $this->assertStringContainsString('<meta property="og:title"', $html);
        $this->assertStringNotContainsString('noindex', $html);
        $this->assertSame(1, substr_count($html, '<title>'));
        $this->assertEmpty($home->headers->getCookies(), 'the shell sets no cookie');

        $this->assertStringContainsString("<link rel=\"canonical\" href=\"{$canon}/notices\">", $this->at($h, '/notices')->assertOk()->getContent());
        $this->assertStringContainsString('— ভর্তি</title>', $this->at($h, '/admission')->assertOk()->getContent());
        $this->at($h, '/privacy')->assertOk();
        $this->at($h, '/terms')->assertOk();

        // the SEO title from the settings wins on the home page
        $i->forceFill(['settings' => ['public_site' => ['enabled' => true, 'seo' => ['title' => 'Best school in town', 'description' => 'Admission open']]]])->save();
        $this->assertStringContainsString('<title>Best school in town</title>', $this->at($h, '/')->getContent());

        // site off: noindex; robots disallows everything; no sitemap
        $i->forceFill(['settings' => ['public_site' => ['enabled' => false]]])->save();
        $this->assertStringContainsString('<meta name="robots" content="noindex">', $this->at($h, '/')->assertOk()->getContent());
        $this->assertSame("User-agent: *\nDisallow: /\n", $this->at($h, '/robots.txt')->assertOk()->getContent());
        $this->at($h, '/sitemap.xml')->assertNotFound();
    }

    public function test_robots_and_sitemap_follow_the_site(): void
    {
        $this->travelTo('2030-04-10 09:00:00');
        $i = $this->makeInstitution('shellmap', 'coaching');
        $i->forceFill(['settings' => ['public_site' => ['enabled' => true, 'admission_open' => true]]])->save();
        $this->travelTo('2030-04-20 09:00:00');
        Tenancy::as($i, fn () => Notice::create(['title' => 'Open', 'content' => 'x', 'target' => 'all', 'is_public' => 1, 'published_at' => now()]));
        $h = $this->hostOf($i);
        $base = app(DomainService::class)->primaryUrl($i);

        $robots = $this->at($h, '/robots.txt')->assertOk()->assertHeader('Content-Type', 'text/plain; charset=utf-8')->getContent();
        foreach (['Allow: /notices', 'Allow: /admission', 'Disallow: /admin', 'Disallow: /api', 'Disallow: /login', "Sitemap: {$base}/sitemap.xml"] as $line) $this->assertStringContainsString($line, $robots);

        $map = $this->at($h, '/sitemap.xml')->assertOk()->assertHeader('Content-Type', 'application/xml; charset=utf-8')->getContent();
        foreach (["<loc>{$base}/</loc>", "<loc>{$base}/notices</loc>", "<loc>{$base}/admission</loc>", '<lastmod>2030-04-20</lastmod>'] as $part) $this->assertStringContainsString($part, $map);
        $this->assertNotFalse(simplexml_load_string($map));

        // admission closed: not in the sitemap
        $i->forceFill(['settings' => ['public_site' => ['enabled' => true, 'admission_open' => false]]])->save();
        $this->assertStringNotContainsString('/admission</loc>', $this->at($h, '/sitemap.xml')->getContent());

        // module off: the site counts as off
        $i->forceFill(['settings' => ['public_site' => ['enabled' => true]], 'enabled_modules' => ['public_site' => false]])->save();
        $this->assertStringContainsString('noindex', $this->at($h, '/')->getContent());
    }

    public function test_central_unknown_and_suspended_hosts_get_the_plain_shell(): void
    {
        $central = config('tenancy.central_domains')[0] ?? config('tenancy.base_domain');
        $this->assertSame(self::SHELL, $this->at($central, '/')->assertOk()->getContent());
        $this->assertSame("User-agent: *\nAllow: /\n", $this->at($central, '/robots.txt')->assertOk()->getContent());
        $this->assertSame(self::SHELL, $this->at('nobody.' . config('tenancy.base_domain'), '/')->assertOk()->getContent());
        $s = $this->makeInstitution('shellsus', 'school', 'suspended');
        $s->forceFill(['settings' => ['public_site' => ['enabled' => true]]])->save();
        $this->assertSame(self::SHELL, $this->at($this->hostOf($s), '/')->assertOk()->getContent());

        // a missing build still answers with a minimal shell, never an error
        config(['app.public_shell_path' => $this->file . '.missing']);
        $this->assertStringContainsString('<div id="root"></div>', $this->at($central, '/')->assertOk()->getContent());
    }
}

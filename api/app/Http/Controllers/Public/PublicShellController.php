<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\{Institution, Notice};
use App\Services\DomainService;
use App\Services\PublicSite\PublicSiteService;
use App\Services\Tenancy\TenantResolver;
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

// D202 PUB.4 (docs/modules/public-website.md "SEO Shell"): the first load of /, /notices, /admission, /privacy and /terms gets the
// built SPA index.html with the institution's own <title>, description, canonical and Open Graph tags; robots.txt and sitemap.xml
// are per institution. Every value is escaped. Canonical is always the primary URL. No session and no cookie (not the web group).
// The tenant is read from the Host here and nothing is bound: an unknown, inactive or suspended host gets the plain SPA shell
// (the SPA shows why), exactly what nginx served before these paths came to Laravel.
class PublicShellController extends Controller
{
    private const LABELS = ['home' => '', 'notices' => ' — নোটিশ', 'admission' => ' — ভর্তি', 'privacy' => ' — গোপনীয়তা নীতি', 'terms' => ' — সেবার শর্তাবলি'];
    private const FALLBACK = '<!doctype html><html lang="bn"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title></title></head><body><div id="root"></div></body></html>';
    private static array $shell = ['path' => null, 'mtime' => null, 'html' => null];

    public function __construct(private TenantResolver $tenants, private DomainService $domains, private PublicSiteService $site) {}

    public function home(Request $r)      { return $this->render($r, 'home'); }
    public function notices(Request $r)   { return $this->render($r, 'notices'); }
    public function admission(Request $r) { return $this->render($r, 'admission'); }
    public function privacy(Request $r)   { return $this->render($r, 'privacy'); }
    public function terms(Request $r)     { return $this->render($r, 'terms'); }

    public function robots(Request $r)
    {
        $i = $this->tenant($r);
        if (!$i) return $this->text("User-agent: *\nAllow: /\n");                      // the central host / an unknown host: unchanged default
        if (!$this->site->open($i)) return $this->text("User-agent: *\nDisallow: /\n");
        $base = $this->domains->primaryUrl($i);
        $lines = ['User-agent: *', 'Allow: /$', 'Allow: /notices', 'Allow: /admission', 'Allow: /privacy', 'Allow: /terms'];
        foreach (['/admin', '/teacher', '/student', '/parent', '/accountant', '/staff', '/api', '/login', '/onboarding'] as $p) $lines[] = "Disallow: {$p}";
        $lines[] = "Sitemap: {$base}/sitemap.xml";
        return $this->text(implode("\n", $lines) . "\n");
    }

    public function sitemap(Request $r)
    {
        $i = $this->tenant($r);
        if (!$i || !$this->site->open($i)) abort(404);
        $base = $this->domains->primaryUrl($i);
        $last = Tenancy::as($i, fn () => app(PublicSiteService::class)->notices()->value('published_at'));
        $mod = collect([$i->updated_at, $last ? \Carbon\Carbon::parse($last) : null])->filter()->max();
        $paths = ['/', '/notices'];
        if ($this->site->settings($i)['admission_open']) $paths[] = '/admission';
        $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
        foreach ($paths as $p) {
            $xml .= '  <url><loc>' . e($base . $p) . '</loc>' . ($mod ? '<lastmod>' . $mod->toDateString() . '</lastmod>' : '') . "</url>\n";
        }
        return response($xml . "</urlset>\n")->header('Content-Type', 'application/xml; charset=utf-8')->header('Cache-Control', 'no-cache');
    }

    private function render(Request $r, string $page)
    {
        $html = $this->shell();
        $i = $this->tenant($r);
        if (!$i) return $this->html($html);

        $ps = $this->site->settings($i);
        $on = $this->site->open($i);
        $title = e(($page === 'home' ? $ps['seo']['title'] : '') ?: ($i->name . self::LABELS[$page]));
        $desc = e(Str::limit(trim(preg_replace('/\s+/u', ' ', $ps['seo']['description'] ?: ($ps['about'] ?: ($ps['headline'] ?: $i->name)))), 160, ''));
        $canon = e($this->domains->primaryUrl($i) . ($page === 'home' ? '/' : '/' . $page));
        $img = $i->logo_path ? e(Storage::disk('public')->url($i->logo_path)) : '';
        $head = "<meta name=\"description\" content=\"{$desc}\">"
            . "<link rel=\"canonical\" href=\"{$canon}\">"
            . "<meta property=\"og:type\" content=\"website\"><meta property=\"og:title\" content=\"{$title}\">"
            . "<meta property=\"og:description\" content=\"{$desc}\"><meta property=\"og:url\" content=\"{$canon}\">"
            . ($img ? "<meta property=\"og:image\" content=\"{$img}\">" : '')
            . ($on ? '' : '<meta name="robots" content="noindex">');
        $html = preg_replace('#<title>.*?</title>#s', '<title>' . str_replace(['\\', '$'], ['\\\\', '\\$'], $title) . '</title>', $html, 1);
        $at = strpos($html, '</head>');
        if ($at !== false) $html = substr_replace($html, $head . '</head>', $at, strlen('</head>'));
        return $this->html($html);
    }

    /** the institution of this Host, only when it is active (trial counts) - nothing is bound */
    private function tenant(Request $r): ?Institution
    {
        $host = strtolower($r->getHost());
        if ($this->tenants->isCentralHost($host)) return null;
        $i = $this->tenants->resolve($host);
        return $i && !in_array($i->status, ['inactive', 'suspended'], true) ? $i : null;
    }

    /** the built index.html, kept in memory per worker and re-read when the file changes */
    private function shell(): string
    {
        $path = (string) config('app.public_shell_path');
        $mtime = is_file($path) ? @filemtime($path) : false;
        if ($mtime === false) return self::FALLBACK;
        if (self::$shell['path'] !== $path || self::$shell['mtime'] !== $mtime) {
            self::$shell = ['path' => $path, 'mtime' => $mtime, 'html' => (string) file_get_contents($path)];
        }
        return self::$shell['html'];
    }

    private function html(string $html) { return response($html)->header('Content-Type', 'text/html; charset=utf-8')->header('Cache-Control', 'no-cache'); }
    private function text(string $t) { return response($t)->header('Content-Type', 'text/plain; charset=utf-8')->header('Cache-Control', 'no-cache'); }
}

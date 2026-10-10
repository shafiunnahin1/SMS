<?php

namespace App\Services;

use App\Support\Tenancy;
use HeadlessChromium\BrowserFactory;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

// docs/modules/pdf-reports.md + D50: a Blade view is rendered to HTML and printed by headless Chromium (correct Bengali and
// Arabic shaping). This class is the one place that knows the engine. The page gets no network: images arrive as data URIs.
class PdfService
{
    private const PAPER = ['a4' => [8.27, 11.69], 'a5' => [5.83, 8.27], 'letter' => [8.5, 11.0]];   // inches (Chromium's unit)

    /** Render a Blade view to PDF bytes; every view gets the theme, the logo (data URI), the locale and its direction */
    public function render(string $view, array $data = [], string $paper = 'a4', string $orientation = 'portrait'): string
    {
        $institution = Tenancy::current();
        $locale = app()->getLocale();
        $shared = [
            'institution' => $institution,
            'theme' => $institution ? app(ThemeService::class)->getTheme($institution) : app(ThemeService::class)->defaultTheme(),
            'logo' => $this->logoDataUri($institution?->logo_path),
            'locale' => $locale,
            'dir' => $locale === 'ar' ? 'rtl' : 'ltr',
        ];
        return $this->print(view($view, $data + $shared)->render(), $paper, $orientation);
    }

    /** Store a generated PDF as a temporary file of the current institution (docs/architecture/file-storage.md: tmp, private disk) */
    public function storeTemporary(string $bytes): string
    {
        $path = 'institutions/' . Tenancy::current()->id . '/tmp/' . Str::uuid() . '.pdf';
        Storage::disk('private')->put($path, $bytes);
        return $path;
    }

    private function print(string $html, string $paper, string $orientation): string
    {
        [$w, $h] = self::PAPER[$paper] ?? self::PAPER['a4'];
        $timeout = (int) config('pdf.timeout_ms');
        $browser = (new BrowserFactory(config('pdf.chrome_binary')))->createBrowser([
            'noSandbox' => (bool) config('pdf.no_sandbox'),
            'startupTimeout' => (int) ceil($timeout / 1000),
            'customFlags' => ['--disable-dev-shm-usage', '--disable-gpu'],
            'enableImages' => true,
        ]);
        try {
            $page = $browser->createPage();
            $page->setHtml($html, $timeout);
            return base64_decode($page->pdf([
                'printBackground' => true,
                'landscape' => $orientation === 'landscape',
                'paperWidth' => $w, 'paperHeight' => $h,
                'marginTop' => 0.4, 'marginBottom' => 0.4, 'marginLeft' => 0.4, 'marginRight' => 0.4,
            ])->getBase64($timeout));
        } finally {
            $browser->close();
        }
    }

    private function logoDataUri(?string $path): ?string
    {
        if (!$path || !Storage::disk('public')->exists($path)) return null;
        $mime = Storage::disk('public')->mimeType($path) ?: 'image/png';
        return 'data:' . $mime . ';base64,' . base64_encode(Storage::disk('public')->get($path));
    }
}

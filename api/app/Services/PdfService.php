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
    private const PAPER = ['a4' => [8.27, 11.69], 'a5' => [5.83, 8.27], 'letter' => [8.5, 11.0], 'legal' => [8.5, 14.0]];   // inches (Chromium's unit)

    /** Render a Blade view to PDF bytes; every view gets the theme, the logo (data URI), the locale and its direction */
    public function render(string $view, array $data = [], string $paper = 'a4', string $orientation = 'portrait', bool $qbankFigures = false): string
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
        $html = view($view, $data + $shared)->render();
        if ($qbankFigures && preg_match(self::FIGURE, $html)) return $this->printWithFigures($html, $paper, $orientation);
        return $this->print($html, $paper, $orientation);
    }

    /** D127 OMR: a full-bleed page keeps persisted normalized scan geometry aligned with printed coordinates. */
    public function renderOmr(string $view, array $data = [], string $paper = 'a4', string $orientation = 'portrait'): string
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
        return $this->print(view($view, $data + $shared)->render(), $paper, $orientation, 0);
    }

    /** D118 (4): qbank's graph and diagram tokens in a printed page */
    public const FIGURE = '/\[\[qmx-(?:graph|diagram):[A-Za-z0-9_-]{10,}\]\]/';

    /** The page after qbank's renderers drew its graphs and diagrams (each an <img> of an SVG; a figure that cannot be drawn becomes a
     *  placeholder). Without the qbank folder every figure is a placeholder. Used by printing; public so a test can read the result. */
    public function drawFigures(string $html): string
    {
        return $this->withFigurePage($html, fn ($page) => $page->evaluate('document.documentElement.outerHTML')->getReturnValue());
    }

    private function printWithFigures(string $html, string $paper, string $orientation): string
    {
        [$w, $h] = self::PAPER[$paper] ?? self::PAPER['a4'];
        $timeout = (int) config('pdf.timeout_ms');
        return $this->withFigurePage($html, fn ($page) => base64_decode($page->pdf(['printBackground' => true, 'landscape' => $orientation === 'landscape',
            'paperWidth' => $w, 'paperHeight' => $h, 'marginTop' => 0.4, 'marginBottom' => 0.4, 'marginLeft' => 0.4, 'marginRight' => 0.4])->getBase64($timeout)));
    }

    /** a temporary local page next to a link to qbank's folder (file:// - still no network), drawn, then handed to $use */
    private function withFigurePage(string $html, \Closure $use): mixed
    {
        $tools = (string) config('pdf.qbank_tools_path');
        $haveTools = is_file($tools . '/js/math/tools/graph/graph-core.js') && is_file($tools . '/js/diagram/question-diagram-renderer-v1.js');
        $placeholder = e(__('pdf.qb_paper.figure_missing'));
        if (!$haveTools) $html = preg_replace(self::FIGURE, '<span class="qb-figure-missing">[' . $placeholder . ']</span>', $html);
        $script = $haveTools ? str_replace('__MISSING__', json_encode('[' . __('pdf.qb_paper.figure_missing') . ']'), self::DRAW_SCRIPT) : '<script>document.documentElement.dataset.qbReady = "1"</script>';
        $html = str_contains($html, '</body>') ? str_replace('</body>', $script . '</body>', $html) : $html . $script;

        $dir = sys_get_temp_dir() . '/sms-pdf-' . Str::uuid();   // a throw-away page, not a user file
        @mkdir($dir, 0700, true);
        file_put_contents($dir . '/page.html', $html);
        if ($haveTools) @symlink(realpath($tools), $dir . '/qbank');
        $timeout = (int) config('pdf.timeout_ms');
        $browser = (new BrowserFactory(config('pdf.chrome_binary')))->createBrowser([
            'noSandbox' => (bool) config('pdf.no_sandbox'),
            'startupTimeout' => (int) ceil($timeout / 1000),
            'customFlags' => ['--disable-dev-shm-usage', '--disable-gpu', '--allow-file-access-from-files'],
            'enableImages' => true,
        ]);
        try {
            $page = $browser->createPage();
            $page->navigate('file://' . $dir . '/page.html')->waitForNavigation('load', $timeout);
            $until = microtime(true) + $timeout / 1000;
            while ($page->evaluate('document.documentElement.dataset.qbReady || ""')->getReturnValue() !== '1') {
                if (microtime(true) > $until) break;
                usleep(100_000);
            }
            return $use($page);
        } finally {
            $browser->close();
            @unlink($dir . '/qbank');
            @unlink($dir . '/page.html');
            @rmdir($dir);
        }
    }

    /** runs inside the print page: qbank's own renderers turn each token into an <img> of its SVG (an SVG image runs no script) */
    private const DRAW_SCRIPT = <<<'JS'
<script type="module">
const RX = /\[\[qmx-(graph|diagram):[A-Za-z0-9_-]{10,200000}\]\]/g;
const missing = __MISSING__;
const done = () => { document.documentElement.dataset.qbReady = '1' };
let core = null, diagram = null;
try { core = await import('./qbank/js/math/tools/graph/graph-core.js') } catch (e) {}
try {
  await new Promise((ok, no) => { const s = document.createElement('script'); s.src = './qbank/js/diagram/question-diagram-renderer-v1.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s) });
  diagram = window.QmxDiagram;
} catch (e) {}
const draw = (token, kind) => {
  try {
    const svg = kind === 'graph' ? core.graphSvg(core.decodeGraphToken(token)) : diagram.svgMarkup(diagram.decodeToken(token));
    if (typeof svg !== 'string' || !svg.trim().startsWith('<svg')) return null;
    const img = document.createElement('img');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    img.className = 'qb-figure'; img.dataset.kind = kind;
    img.style.cssText = 'display:block;max-width:100%;margin:6px auto';
    return img;
  } catch (e) { return null }
};
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
const nodes = [];
while (walker.nextNode()) { RX.lastIndex = 0; if (RX.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode) }
for (const node of nodes) {
  const frag = document.createDocumentFragment();
  let last = 0; RX.lastIndex = 0; let m;
  const text = node.nodeValue;
  while ((m = RX.exec(text))) {
    frag.append(text.slice(last, m.index));
    const fig = draw(m[0], m[1]);
    if (fig) frag.append(fig); else { const s = document.createElement('span'); s.className = 'qb-figure-missing'; s.textContent = missing; frag.append(s) }
    last = m.index + m[0].length;
  }
  frag.append(text.slice(last));
  node.replaceWith(frag);
}
const imgs = [...document.querySelectorAll('img.qb-figure')];
await Promise.all(imgs.map((i) => i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r })));
done();
</script>
JS;

    /** Store a generated PDF as a temporary file of the current institution (docs/architecture/file-storage.md: tmp, private disk) */
    public function storeTemporary(string $bytes): string
    {
        $path = 'institutions/' . Tenancy::current()->id . '/tmp/' . Str::uuid() . '.pdf';
        Storage::disk('private')->put($path, $bytes);
        return $path;
    }

    private function print(string $html, string $paper, string $orientation, float $margin = 0.4): string
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
                'marginTop' => $margin, 'marginBottom' => $margin, 'marginLeft' => $margin, 'marginRight' => $margin,
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

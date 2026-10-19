<?php

namespace Tests\Feature\Pdf;

use App\Services\PdfService;
use Tests\TestCase;

// R2.1.2 / D118 (4): a printed page with qbank graph and diagram tokens - Chromium loads qbank's own renderers from the local copy
// (file://, no network) and each figure becomes an <img> of its SVG; a token qbank cannot read, or a missing qbank folder, prints a
// placeholder instead of breaking the paper.
class PdfFiguresTest extends TestCase
{
    private function graphToken(): string
    {
        return '[[qmx-graph:' . rtrim(strtr(base64_encode(json_encode(['type' => 'function', 'expressions' => ['x^2']])), '+/', '-_'), '=') . ']]';
    }

    public function test_graphs_are_drawn_and_unreadable_figures_become_placeholders(): void
    {
        $html = '<html><body><p>Q1. ' . $this->graphToken() . '</p><p>Q2. [[qmx-diagram:not-a-real-diagram-payload]]</p></body></html>';
        $out = app(PdfService::class)->drawFigures($html);
        $this->assertSame(1, substr_count($out, 'class="qb-figure"'), 'the graph is drawn');
        $this->assertStringContainsString('src="data:image/svg+xml', $out);
        $this->assertStringContainsString('qb-figure-missing', $out, 'the unreadable diagram is a placeholder');
        $this->assertStringNotContainsString('[[qmx-graph:', $out);
    }

    public function test_without_the_qbank_folder_every_figure_is_a_placeholder(): void
    {
        config(['pdf.qbank_tools_path' => sys_get_temp_dir() . '/no-such-qbank-folder']);
        $out = app(PdfService::class)->drawFigures('<html><body><p>' . $this->graphToken() . '</p></body></html>');
        $this->assertStringContainsString('qb-figure-missing', $out);
        $this->assertStringNotContainsString('class="qb-figure"', $out);
    }

    public function test_a_paper_with_a_graph_prints(): void
    {
        $bytes = app(PdfService::class)->render('pdf.layout', ['body' => 'গ্রাফ ' . $this->graphToken()], 'a4', 'portrait', true);
        $this->assertStringStartsWith('%PDF', $bytes);
        $this->assertStringContainsString('Skia/PDF', $bytes);
    }
}

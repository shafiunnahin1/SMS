<?php

namespace Tests\Feature\Pdf;

use App\Services\PdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

// D50: every PDF is printed by headless Chromium (dompdf is gone), with the institution's logo embedded as a data URI so the
// page needs no network.
class PdfEngineTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_bengali_page_is_printed_by_chromium_with_the_institution_logo(): void
    {
        Storage::fake('public');
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
        Storage::disk('public')->put('institutions/logo.png', $png);
        $inst = $this->makeInstitution('pdfeng');
        $inst->forceFill(['logo_path' => 'institutions/logo.png'])->save();
        $this->bindTenant($inst->fresh());

        $html = view('pdf.layout', ['institution' => $inst, 'theme' => ['primary_color' => '#123456'], 'logo' => 'data:image/png;base64,' . base64_encode($png),
            'locale' => 'bn', 'dir' => 'ltr', 'body' => 'ক্ষ্মী'])->render();
        $this->assertStringContainsString('src="data:image/png;base64,', $html, 'the logo is inline, not a URL Chromium would fetch');

        $bytes = app(PdfService::class)->render('pdf.layout', ['body' => 'শিক্ষার্থী রসিদ'], 'a5');
        $this->assertStringStartsWith('%PDF', $bytes);
        $this->assertStringContainsString('Skia/PDF', $bytes, 'Chromium (Skia) printed it');
        $this->assertStringContainsString('/Subtype /Image', $bytes, 'the logo is in the PDF');
        $this->assertFalse(class_exists(\Dompdf\Dompdf::class), 'D50: dompdf is not installed');
    }
}

<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbMedia, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Process, Storage};
use Tests\TestCase;

// D68 (2): an uploaded PDF gets server-made pictures of its first pages (poppler's pdftoppm), at most PREVIEW_PAGES; without
// pdftoppm (or when it fails) the upload still works and the writer adds pictures by hand.
class QbResourcePreviewTest extends TestCase
{
    use RefreshDatabase;

    private function pdf(int $pages): UploadedFile
    {
        $kids = implode(' ', array_map(fn ($i) => (3 + $i) . ' 0 R', range(0, $pages - 1)));
        $objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [{$kids}] /Count {$pages} >>"];
        for ($i = 0; $i < $pages; $i++) $objs[] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>';
        $out = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objs as $n => $o) { $offsets[] = strlen($out); $out .= ($n + 1) . " 0 obj\n{$o}\nendobj\n"; }
        $xref = strlen($out);
        $out .= "xref\n0 " . (count($objs) + 1) . "\n0000000000 65535 f \n" . implode('', array_map(fn ($o) => sprintf("%010d 00000 n \n", $o), $offsets));
        $out .= "trailer\n<< /Size " . (count($objs) + 1) . " /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF\n";
        return UploadedFile::fake()->createWithContent('book.pdf', $out);
    }

    public function test_the_first_pages_become_pictures_when_poppler_is_there(): void
    {
        Storage::fake('private');
        $writer = User::create(['institution_id' => null, 'name' => 'w', 'role' => 'content_writer', 'phone' => '01700000011', 'password' => 'Writer-pass-2026', 'is_active' => true]);
        $central = 'admin.' . config('tenancy.base_domain');
        $data = $this->api('POST', $central, 'writer/resource-files', $writer, ['file' => $this->pdf(5)])->assertCreated()->json('data');
        $this->assertSame(5, $data['page_count']);
        $hasPoppler = Process::run(['which', 'pdftoppm'])->successful();
        $this->assertCount($hasPoppler ? 3 : 0, $data['previews'], 'at most the first three pages');
        $this->assertSame($hasPoppler ? 3 : 0, QbMedia::where('mime', 'image/png')->count());
    }

    public function test_a_failing_renderer_leaves_the_upload_working(): void
    {
        Storage::fake('private');
        Process::fake(['*' => Process::result(exitCode: 1)]);
        $writer = User::create(['institution_id' => null, 'name' => 'w', 'role' => 'content_writer', 'phone' => '01700000012', 'password' => 'Writer-pass-2026', 'is_active' => true]);
        $data = $this->api('POST', 'admin.' . config('tenancy.base_domain'), 'writer/resource-files', $writer, ['file' => $this->pdf(2)])->assertCreated()->json('data');
        $this->assertSame([], $data['previews']);
        $this->assertSame(1, QbMedia::count(), 'only the PDF');
    }
}

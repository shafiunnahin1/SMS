<?php

namespace Tests\Feature\Files;

use App\Services\PdfService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

// docs/architecture/file-storage.md section 5 "FileCollisionTest": two institutions producing a generated file in the same second get
// different paths - one never lands on the other (the old `id-cards/bulk-<timestamp>.pdf` bug). R1's generated files are the
// temporary PDFs (receipts); ID cards are a later module.
class FileCollisionTest extends TestCase
{
    use RefreshDatabase;

    public function test_two_institutions_in_the_same_second_never_share_a_path(): void
    {
        Storage::fake('private');
        $this->freezeSecond();
        [$a, $b] = [$this->makeInstitution('colla'), $this->makeInstitution('collb')];
        $pa = Tenancy::as($a, fn () => app(PdfService::class)->storeTemporary('A'));
        $pb = Tenancy::as($b, fn () => app(PdfService::class)->storeTemporary('B'));
        $pa2 = Tenancy::as($a, fn () => app(PdfService::class)->storeTemporary('A2'));

        $this->assertCount(3, array_unique([$pa, $pb, $pa2]));
        $this->assertSame('A', Storage::disk('private')->get($pa), 'nothing overwrote the first file');
        $this->assertSame('B', Storage::disk('private')->get($pb));
        $this->assertStringStartsWith("institutions/{$a->id}/tmp/", $pa);
        $this->assertStringStartsWith("institutions/{$b->id}/tmp/", $pb);
    }
}

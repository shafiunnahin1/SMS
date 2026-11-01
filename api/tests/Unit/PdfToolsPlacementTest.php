<?php

namespace Tests\Unit;

use App\Services\PdfService;
use PHPUnit\Framework\TestCase;

// D185 PDFW.1: qbank's tools go beside the print page as a link, or - where links cannot be made (Windows without Developer Mode) -
// as a copy; cleaning up removes only the link or the copy, never the real tools folder or anything a link inside points to
class PdfToolsPlacementTest extends TestCase
{
    private string $root;

    protected function setUp(): void
    {
        parent::setUp();
        $this->root = sys_get_temp_dir() . '/pdfw-' . bin2hex(random_bytes(4));
        mkdir($this->root . '/tools/js/math', 0700, true);
        file_put_contents($this->root . '/tools/js/math/graph-core.js', 'export const x = 1');
        mkdir($this->root . '/outside');
        file_put_contents($this->root . '/outside/keep.txt', 'keep');
        mkdir($this->root . '/page');
    }

    /** can this system make a directory symlink? (Windows without Developer Mode cannot - the case D185 is for) */
    private function canLink(): bool
    {
        $probe = $this->root . '/probe-link';
        $ok = @symlink($this->root . '/outside', $probe);
        if ($ok) PdfService::removeTools($probe);
        return $ok;
    }

    protected function tearDown(): void
    {
        PdfService::removeTools($this->root);   // the test's own temporary folder
        parent::tearDown();
    }

    public function test_a_copy_is_made_when_a_link_cannot_be_and_cleaning_up_removes_only_the_copy(): void
    {
        $target = $this->root . '/page/qbank';
        $this->assertSame('copy', PdfService::placeTools($this->root . '/tools', $target, fn () => false));
        $this->assertFalse(is_link($target));
        $this->assertSame('export const x = 1', file_get_contents($target . '/js/math/graph-core.js'));

        if ($this->canLink()) symlink($this->root . '/outside', $target . '/js/escape');   // a link inside the copy is never followed when removing
        PdfService::removeTools($target);
        $this->assertDirectoryDoesNotExist($target);
        $this->assertFileExists($this->root . '/tools/js/math/graph-core.js');
        $this->assertFileExists($this->root . '/outside/keep.txt');
    }

    public function test_a_link_is_used_where_possible_and_only_unlinked(): void
    {
        $target = $this->root . '/page/qbank';
        $linkable = $this->canLink();
        // with the system's own linker: a link where the system allows one (Linux), else the copy (Windows without Developer Mode)
        $this->assertSame($linkable ? 'link' : 'copy', PdfService::placeTools($this->root . '/tools', $target));
        $this->assertSame($linkable, is_link($target));
        $this->assertFileExists($target . '/js/math/graph-core.js');
        PdfService::removeTools($target);
        $this->assertFalse(file_exists($target) || is_link($target));
        $this->assertFileExists($this->root . '/tools/js/math/graph-core.js');
        $this->assertSame('none', PdfService::placeTools($this->root . '/missing', $this->root . '/page/q2', fn () => false));
    }
}

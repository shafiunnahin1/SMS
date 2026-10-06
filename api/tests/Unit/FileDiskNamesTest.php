<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

// docs/architecture/file-storage.md section 5 "FileDiskNamesTest" (static scan): app code names only the `private` and
// `public` disks, and never builds user-file paths with storage_path()/public_path()
class FileDiskNamesTest extends TestCase
{
    private const DISK_CALL = '/(?:Storage::disk|->disk)\(\s*[\'"]([^\'"]+)[\'"]\s*\)|->(?:store|storeAs|storePublicly)\([^;]*?[\'"]([a-z0-9_]+)[\'"]\s*\)\s*;/';

    private static function root(): string { return dirname(__DIR__, 2); }

    private static function appFiles(): array
    {
        $out = [];
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(self::root() . '/app', \FilesystemIterator::SKIP_DOTS));
        foreach ($it as $f) if ($f->getExtension() === 'php') $out[substr($f->getPathname(), strlen(self::root()) + 1)] = file_get_contents($f->getPathname());
        return $out;
    }

    public function test_only_the_private_and_public_disks_are_named(): void
    {
        $bad = [];
        foreach (self::appFiles() as $path => $code) {
            preg_match_all(self::DISK_CALL, $code, $m, PREG_SET_ORDER);
            foreach ($m as $hit) {
                $disk = $hit[1] !== '' ? $hit[1] : ($hit[2] ?? '');
                if (!in_array($disk, ['private', 'public'], true)) $bad[] = "{$path}: {$disk}";
            }
        }
        $this->assertSame([], $bad);
    }

    public function test_no_user_file_path_is_built_with_storage_path_or_public_path(): void
    {
        $bad = array_keys(array_filter(self::appFiles(), fn ($code) => preg_match('/\b(?:storage_path|public_path)\s*\(/', $code)));
        $this->assertSame([], $bad);
    }

    public function test_the_scan_catches_a_wrong_disk(): void
    {
        $this->assertMatchesRegularExpression(self::DISK_CALL, "Storage::disk('s3')->put(\$p, \$c);"); // guard:allow(disk) - a sample the scan must catch
        $this->assertMatchesRegularExpression(self::DISK_CALL, "\$file->storeAs('dir', 'n.png', 'local');");
        preg_match(self::DISK_CALL, "\$file->storeAs('dir', 'n.png', 'public');", $m);
        $this->assertSame('public', $m[2]);
    }

    public function test_the_two_disks_are_configured_and_default_to_private(): void
    {
        $config = file_get_contents(self::root() . '/config/filesystems.php');
        $this->assertStringContainsString("'default' => 'private'", $config);
        $this->assertMatchesRegularExpression("/'private' => \\\$useS3/", $config);
        $this->assertMatchesRegularExpression("/'public' => \\\$useS3/", $config);
        $this->assertStringNotContainsString("'s3' =>", $config, 'no separately named s3 disk: FILES_DRIVER switches both');
    }
}

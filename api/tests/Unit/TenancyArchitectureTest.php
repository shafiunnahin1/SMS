<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

// D25 / docs/TESTING.md "Revision 7 - Tenant Isolation Tests". Source scan: dangerous tenancy calls only in allowlisted files.
class TenancyArchitectureTest extends TestCase
{
    private const FORBIDDEN = [
        'withoutGlobalScope(s)'            => '/withoutGlobalScopes?\s*\(/',   // guard:allow(tenant-scope) scanner pattern, not a call
        "app()->instance('currentInstitution'" => '/->instance\(\s*[\'"]currentInstitution[\'"]/',
        'anyInstitution('                  => '/(?<![\w$])anyInstitution\s*\(/',
        'withoutTenancy('                  => '/withoutTenancy\s*\(/',
        'raw DB:: query'                   => '/DB::(?:table|select|statement|affectingStatement|insert|update|delete|unprepared)\s*\(/',
        'bulk Model::insert/upsert'        => '/(?<![\w$\\\\])(?!TenantBulk::)[A-Z]\w*::(?:insert|upsert)\s*\(/',   // TenantBulk:: is the sanctioned path
        'Catalogue::asPlatform('           => '/asPlatform\s*\(/',   // D65: a platform (question-bank catalogue) write during an institution's request
    ];

    private static function root(): string { return dirname(__DIR__, 2); }

    /** @return array<string, string> relative path => contents */
    private static function appFiles(): array
    {
        $files = [];
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(self::root() . '/app', \FilesystemIterator::SKIP_DOTS));
        foreach ($it as $f) {
            if ($f->getExtension() !== 'php') continue;
            $rel = str_replace('\\', '/', substr($f->getPathname(), strlen(self::root()) + 1));
            $files[$rel] = file_get_contents($f->getPathname());
        }
        ksort($files);
        return $files;
    }

    private static function allowlist(): array
    {
        return require self::root() . '/tests/Architecture/tenancy-allowlist.php';
    }

    public function test_tenancy_bypasses_appear_only_in_allowlisted_files(): void
    {
        $allowed = self::allowlist();
        $violations = [];
        foreach (self::appFiles() as $path => $code) {
            if (isset($allowed[$path])) continue;
            foreach (self::FORBIDDEN as $what => $rx) {
                if (preg_match($rx, $code)) $violations[] = "{$path}: {$what}";
            }
        }
        $this->assertSame([], $violations, "Tenancy bypass outside tests/Architecture/tenancy-allowlist.php:\n" . implode("\n", $violations));
    }

    public function test_every_allowlist_entry_exists_and_has_a_reason(): void
    {
        foreach (self::allowlist() as $path => $reason) {
            $this->assertFileExists(self::root() . '/' . $path, "stale allowlist entry {$path}");
            $this->assertGreaterThan(10, strlen(trim($reason)), "allowlist entry {$path} needs a reason");
        }
    }

    public function test_the_scan_really_catches_each_pattern(): void
    {
        $samples = [
            '$q->withoutGlobalScope("institution")', "app()->instance('currentInstitution', \$i)", 'Student::anyInstitution()->get()',   // guard:allow(tenant-scope) sample text
            'Tenancy::withoutTenancy(fn () => 1)', "DB::table('students')", 'Attendance::upsert($rows, [], [])',   // guard:allow(raw) sample text
            'Catalogue::asPlatform(fn () => 1)',
        ];
        foreach (array_values(self::FORBIDDEN) as $i => $rx) {
            $this->assertMatchesRegularExpression($rx, $samples[$i]);
        }
        $this->assertDoesNotMatchRegularExpression(self::FORBIDDEN['bulk Model::insert/upsert'], 'return $model::insert($rows);');
        $this->assertDoesNotMatchRegularExpression(self::FORBIDDEN['bulk Model::insert/upsert'], 'TenantBulk::upsert(Attendance::class, $rows, [], []);');
    }

    public function test_every_queued_class_that_touches_a_tenant_model_uses_tenant_aware_job(): void
    {
        $tenantModels = [];
        foreach (glob(self::root() . '/app/Models/*.php') as $file) {
            if (str_contains(file_get_contents($file), 'use BelongsToInstitution')) $tenantModels[] = basename($file, '.php');
        }
        $this->assertNotEmpty($tenantModels);

        $missing = [];
        foreach (self::appFiles() as $path => $code) {
            if (!preg_match('/implements[^{]*\bShouldQueue\b/', $code)) continue;
            $touches = array_filter($tenantModels, fn ($m) => preg_match('/\b' . $m . '\b/', $code));
            if ($touches && !str_contains($code, 'TenantAwareJob')) $missing[] = $path . ' (' . implode(', ', $touches) . ')';
        }
        $this->assertSame([], $missing, "Queued classes using tenant models without TenantAwareJob:\n" . implode("\n", $missing));
    }

    public function test_tenancy_bypass_middleware_is_used_only_on_the_super_group(): void
    {
        $bad = [];
        foreach (glob(self::root() . '/routes/*.php') as $file) {
            foreach (file($file) as $n => $line) {
                if (str_contains($line, 'tenancy.bypass') && !str_contains($line, "prefix('super')")) $bad[] = basename($file) . ':' . ($n + 1);
            }
        }
        $this->assertSame([], $bad, 'tenancy.bypass outside the /super group');
    }

    /**
     * R3.13 (D25): every Release 3 table that docs/database/schema.sql gives a NOT NULL institution_id has a model with
     * BelongsToInstitution - read from the schema and the R3 scope, so a new R3 table cannot slip in unscoped.
     */
    public function test_every_r3_tenant_table_has_a_model_with_belongs_to_institution(): void
    {
        $repo = dirname(self::root());
        $tables = json_decode(file_get_contents($repo . '/docs/release/r3-scope.json'), true)['tables'];
        preg_match_all('/CREATE TABLE (\w+) \((.*?)\n\);/s', file_get_contents($repo . '/docs/database/schema.sql'), $m, PREG_SET_ORDER);
        $scoped = [];
        foreach ($m as [, $table, $body]) if (preg_match('/^\s*institution_id BIGINT UNSIGNED NOT NULL/m', $body)) $scoped[$table] = true;
        $checked = 0; $missing = [];
        foreach ($tables as $table) {
            if (!isset($scoped[$table])) continue;
            $class = 'App\\Models\\' . \Illuminate\Support\Str::studly(\Illuminate\Support\Str::singular($table));
            if (!class_exists($class) || (new $class)->getTable() !== $table) { $missing[] = "{$table}: no model"; continue; }
            if (!in_array(\App\Traits\BelongsToInstitution::class, class_uses_recursive($class), true)) $missing[] = "{$table}: {$class} lacks BelongsToInstitution";
            $checked++;
        }
        $this->assertSame([], $missing);
        $this->assertGreaterThanOrEqual(30, $checked, 'the scan found the R3 tenant tables');
    }
}

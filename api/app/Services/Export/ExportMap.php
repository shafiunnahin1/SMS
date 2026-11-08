<?php

namespace App\Services\Export;

use Illuminate\Support\Facades\Schema;

// D38: reads the committed export map; no table list is hard-coded in PHP. Only tables that exist in this database are exported
// (later releases add the rest); design-only and excluded tables never are.
final class ExportMap
{
    public array $map;

    public function __construct()
    {
        $path = config('tenant_export.map');
        if (!is_file($path)) throw new \RuntimeException('tenant export map missing: ' . $path);
        $this->map = json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    /** Export / import order (FK order) of the tables present here; a backup leaves out the payroll group (D33) */
    public function tables(string $kind = 'export', bool $payroll = false): array
    {
        $skip = array_merge(array_keys($this->map['excluded']), $this->map['design_only_tables'], ($kind === 'backup' || !$payroll) ? $this->map['backup_excludes']['tables'] : []);
        return array_values(array_filter($this->map['order'], fn ($t) => isset($this->map['tables'][$t]) && !in_array($t, $skip, true) && Schema::hasTable($t)));
    }

    public function refs(string $table): array { return $this->map['tables'][$table]['refs'] ?? []; }
    public function polymorphic(string $table): array { return $this->map['tables'][$table]['polymorphic'] ?? []; }
    public function isTenantTable(string $t): bool { return isset($this->map['tables'][$t]); }
    public function isExcluded(string $t): bool { return isset($this->map['excluded'][$t]); }
    /** A ref that keeps its id: named in the map as a platform / excluded target, or a real table that has no institution_id */
    public function isPlatformRef(string $table, string $col, string $target): bool
    {
        if (($this->map['refs_to_excluded_or_platform'][$table][$col] ?? null) === $target) return true;
        return Schema::hasTable($target) && !Schema::hasColumn($target, 'institution_id');
    }

    public function jsonWithIds(): array { return $this->map['json_with_ids']; }
    public function regenerate(): array { return $this->map['regenerate_on_import']; }
    public function nulledColumns(string $kind, bool $payroll = false): array
    {
        $cols = ['users.remember_token', 'users.fcm_token'];                    // D38: no token leaves the platform
        return ($kind === 'backup' || !$payroll) ? array_merge($cols, $this->map['backup_excludes']['columns']) : $cols;
    }
}

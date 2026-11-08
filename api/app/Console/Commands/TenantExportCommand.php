<?php

namespace App\Console\Commands;

use App\Models\{Institution, TenantExport};
use App\Services\Export\TenantExporter;
use App\Support\Tenancy;
use Illuminate\Console\Command;

// D193 EXP.1 (platform-ops.md section 5.6 restore runbook): `tenant:export {id}` on a scratch server restored from a DB backup.
// Always a backup (no payroll group, D33); the passphrase is asked for, never taken from the command line.
class TenantExportCommand extends Command
{
    protected $signature = 'tenant:export {institution : institution id}';
    protected $description = 'Write an encrypted backup file of one institution (restore runbook)';

    public function handle(TenantExporter $exporter): int
    {
        $i = Institution::findOrFail((int) $this->argument('institution'));
        $pass = (string) $this->secret('Passphrase (12+ characters)');
        if (mb_strlen($pass) < 12 || $pass !== (string) $this->secret('Passphrase again')) { $this->error('passphrase too short or not the same'); return self::FAILURE; }
        $e = Tenancy::as($i, fn () => $exporter->build(TenantExport::create(['kind' => 'backup', 'status' => 'queued']), $pass));
        $this->info("backup #{$e->id}: {$e->tables_count} tables, {$e->rows_count} rows, private disk {$e->file_path}, sha256 {$e->checksum}");
        return self::SUCCESS;
    }
}

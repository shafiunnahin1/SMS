<?php

namespace App\Console\Commands;

use App\Services\Export\TenantImporter;
use Illuminate\Console\Command;

// D193 EXP.1 (platform-ops.md section 5.4 / 5.6): `tenant:import <file> --new-slug=...` creates a NEW institution from an export or
// backup file; nothing that exists is touched. The passphrase is asked for.
class TenantImportCommand extends Command
{
    protected $signature = 'tenant:import {file : path of the .edux file} {--new-slug= : slug of the new institution} {--status=trial : trial or active}';
    protected $description = 'Restore an export / backup file as a new institution';

    public function handle(TenantImporter $importer): int
    {
        $slug = (string) $this->option('new-slug');
        if (!preg_match('/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/', $slug) || !in_array($this->option('status'), ['trial', 'active'], true)) {
            $this->error('--new-slug (a-z, 0-9, -) and --status=trial|active are required');
            return self::FAILURE;
        }
        $i = $importer->import((string) $this->argument('file'), (string) $this->secret('Passphrase'), $slug, $this->option('status'), 0);
        $this->info("institution #{$i->id} {$i->slug} created ({$i->status})");
        return self::SUCCESS;
    }
}

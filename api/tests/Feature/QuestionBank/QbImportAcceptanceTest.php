<?php

namespace Tests\Feature\QuestionBank;

use Database\Seeders\QbQuestionTypeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

// D123 (8): the acceptance command on a smaller mixed batch (several 500-record chunks, every type, Bangla + English, failures);
// the full 10,000 run is `php artisan qb:import-acceptance` with its timings in docs/PROGRESS.md
class QbImportAcceptanceTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_mixed_json_and_toon_import_passes_the_acceptance_checks(): void
    {
        Storage::fake('private');
        $this->seed(QbQuestionTypeSeeder::class);
        $this->artisan('qb:import-acceptance', ['--count' => 1200])->expectsOutputToContain('acceptance passed: 1200')->assertSuccessful();
    }
}

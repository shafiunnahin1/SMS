<?php

namespace Tests\Feature\Imports;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

// docs/TESTING.md "ImportKindsTest": only release.import_kinds may be imported; any other kind is 422 kind_not_available (upload and
// template); without the data_migration module /imports is 403; only the admin reaches it. D193 MIG.1 widened the list from
// ['students'] (R1) to every kind of data-migration.md section 1; `staff` (named only in a schema comment) stays refused.
class ImportKindsTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_the_release_kinds_are_available(): void
    {
        Storage::fake('private');
        $i = $this->makeInstitution('kinds', 'school');
        $admin = $this->makeUser($i, 'admin');
        $host = $this->hostOf($i);
        $file = fn () => UploadedFile::fake()->createWithContent('t.csv', "name,phone\nA,01711111111\n");

        $this->assertSame(['students', 'teachers', 'fee_structure', 'fee_history', 'results', 'attendance'], config('release.import_kinds'));
        foreach (['staff', 'fees', 'exams'] as $kind) {
            $this->api('POST', $host, 'imports', $admin, ['kind' => $kind, 'file' => $file()])->assertStatus(422)->assertJsonPath('error', 'kind_not_available');
            $this->api('GET', $host, "imports/templates/{$kind}.xlsx", $admin)->assertStatus(422)->assertJsonPath('error', 'kind_not_available');
        }
        $this->api('POST', $host, 'imports', $admin, ['kind' => 'students', 'file' => $file()])->assertCreated();
        foreach (config('release.import_kinds') as $kind) $this->api('GET', $host, "imports/templates/{$kind}.xlsx", $admin)->assertOk();

        $this->api('GET', $host, 'imports', $this->makeUser($i, 'teacher'))->assertForbidden();
        $i->forceFill(['settings' => ['module_overrides' => ['data_migration' => false]]])->save();
        config(['release.modules' => array_values(array_diff(config('release.modules'), ['data_migration']))]);    // the module switched off
        $this->api('GET', $host, 'imports', $admin)->assertForbidden()->assertJsonPath('error', 'module_disabled');
    }
}

<?php

namespace Tests\Feature\Imports;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

// docs/TESTING.md "ImportKindsTest": release.import_kinds = ['students']; any other kind is 422 kind_not_available (upload and
// template); without the data_migration module /imports is 403; only the admin reaches it.
class ImportKindsTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_the_student_kind_is_available_in_release_1(): void
    {
        Storage::fake('private');
        $i = $this->makeInstitution('kinds', 'school');
        $admin = $this->makeUser($i, 'admin');
        $host = $this->hostOf($i);
        $file = fn () => UploadedFile::fake()->createWithContent('t.csv', "name,phone\nA,01711111111\n");

        $this->assertSame(['students'], config('release.import_kinds'));
        foreach (['teachers', 'fee_history', 'results', 'attendance', 'staff'] as $kind) {
            $this->api('POST', $host, 'imports', $admin, ['kind' => $kind, 'file' => $file()])->assertStatus(422)->assertJsonPath('error', 'kind_not_available');
            $this->api('GET', $host, "imports/templates/{$kind}.xlsx", $admin)->assertStatus(422)->assertJsonPath('error', 'kind_not_available');
        }
        $this->api('POST', $host, 'imports', $admin, ['kind' => 'students', 'file' => $file()])->assertCreated();
        $this->api('GET', $host, 'imports/templates/students.xlsx', $admin)->assertOk();

        $this->api('GET', $host, 'imports', $this->makeUser($i, 'teacher'))->assertForbidden();
        $i->forceFill(['settings' => ['module_overrides' => ['data_migration' => false]]])->save();
        config(['release.modules' => array_values(array_diff(config('release.modules'), ['data_migration']))]);    // the module switched off
        $this->api('GET', $host, 'imports', $admin)->assertForbidden()->assertJsonPath('error', 'module_disabled');
    }
}

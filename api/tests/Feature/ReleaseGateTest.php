<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Services\ModuleGate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

// docs/TESTING.md "ReleaseGateTest": a module this build has not shipped is off for everyone, even with a Super Admin override.
class ReleaseGateTest extends TestCase
{
    use RefreshDatabase;

    public function test_release_php_lists_exactly_the_scope_file_modules(): void
    {
        $scope = json_decode(file_get_contents(base_path('../docs/release/r1-scope.json')), true);

        $this->assertSame('R1', config('release.id'));
        $this->assertSame($scope['modules'], config('release.modules'));
    }

    public function test_an_unshipped_module_is_off_even_with_a_super_admin_override(): void
    {
        $gate = app(ModuleGate::class);
        $school = Institution::create(['name' => 'S', 'slug' => 'school', 'institution_type' => 'school', 'status' => 'active',
            'enabled_modules' => ['hostel' => true, 'library' => true]]);

        $this->assertFalse($gate->allows($school, 'hostel'));
        $this->assertFalse($gate->allows($school, 'library'));
        $this->assertTrue($gate->allows($school, 'students'));
    }

    public function test_an_unshipped_modules_route_is_403_module_disabled(): void
    {
        $school = Institution::create(['name' => 'S', 'slug' => 'school', 'institution_type' => 'school', 'status' => 'active',
            'enabled_modules' => ['hostel' => true]]);
        Route::middleware(['tenant', 'module:hostel'])->get('api/v1/test/hostel', fn () => response()->json(['ok' => true]));

        $this->api('GET', $this->hostOf($school), 'test/hostel')->assertForbidden()->assertJson(['error' => 'module_disabled']);
    }

    public function test_enabled_modules_never_lists_an_unshipped_module(): void
    {
        $gate = app(ModuleGate::class);
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            $i = Institution::create(['name' => $type, 'slug' => "r-{$type}", 'institution_type' => $type, 'status' => 'active',
                'enabled_modules' => ['hostel' => true, 'transport' => true]]);
            $this->assertSame([], array_values(array_diff($gate->enabledModules($i), config('release.modules'))), "{$type} lists unshipped modules");
        }
    }
}

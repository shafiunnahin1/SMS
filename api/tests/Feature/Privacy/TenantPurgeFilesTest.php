<?php

namespace Tests\Feature\Privacy;

use App\Models\{AuditLog, Batch, FeeCategory, Institution, OtpToken, Program, User};
use App\Services\{FeeService, StudentService};
use App\Services\Privacy\TenantPurgeService;
use App\Support\{StudentFiles, Tenancy};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Storage};
use Tests\TestCase;

// Step 8.1 (D27, docs/legal/privacy-and-consent.md 5.3): an institution suspended or expired for 30+ days can be removed for
// good - every row with its institution_id, its users' tokens and codes, both disks' institutions/{id}/ folders - and nothing of
// any other institution. Manual only: dry run first, then the slug typed again plus the written "data was handed over".
class TenantPurgeFilesTest extends TestCase
{
    use RefreshDatabase;

    private string $central;
    private User $super;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('private');
        Storage::fake('public');
        $this->central = 'admin.' . config('tenancy.base_domain');
        $this->super = $this->makeUser(null, 'super_admin');
    }

    public function test_the_purge_order_covers_every_table_with_an_institution_id(): void
    {
        $tables = collect(DB::select("SELECT TABLE_NAME AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'institution_id'"))
            ->pluck('t')->sort()->values()->all();
        $this->assertSame($tables, collect(TenantPurgeService::ORDER)->sort()->values()->all(), 'a table with institution_id is missing from TenantPurgeService::ORDER');
    }

    private function populate(string $slug): array
    {
        $i = $this->makeInstitution($slug, 'coaching');
        $admin = $this->makeUser($i, 'admin');
        $student = Tenancy::as($i, function () use ($i) {
            $batch = Batch::create(['program_id' => Program::create(['name' => 'P'])->id, 'name' => 'B']);
            FeeCategory::create(['name' => 'Tuition', 'amount' => 500, 'frequency' => 'monthly']);
            $s = app(StudentService::class)->create(['name' => "Child {$i->slug}", 'guardian_phone' => '01711112222'], $batch);
            $s->forceFill(['photo' => StudentFiles::storePhoto($s, UploadedFile::fake()->image('p.jpg'))])->save();
            $fees = app(FeeService::class);
            $fees->collect($s, [['key' => $fees->dueLines($s)->first()['key']]]);
            return $s;
        });
        Storage::disk('public')->put("institutions/{$i->id}/branding/logo-x.png", 'png');
        $admin->createToken('t');
        OtpToken::create(['user_id' => $admin->id, 'otp' => 'x', 'expires_at' => now()->addMinutes(5)]);
        return [$i, $admin, $student];
    }

    private function suspend(Institution $i, int $daysAgo): void
    {
        $this->travel(-$daysAgo)->days();
        $this->api('PATCH', $this->central, "super/institutions/{$i->id}/toggle", $this->super)->assertOk()->assertJsonPath('data.status', 'suspended');
        $this->travelBack();
    }

    public function test_purging_removes_every_row_and_file_of_that_institution_only(): void
    {
        [$gone, $admin] = $this->populate('gone');
        [$kept, $keptAdmin, $keptStudent] = $this->populate('kept');
        $gone->forceFill(['staff_department_mode' => 'department', 'switched_by' => $admin->id, 'switched_at' => now()])->save();
        $this->suspend($gone, 31);

        $this->assertSame([$gone->id], array_column($this->api('GET', $this->central, 'super/tenant-purge/candidates', $this->super)->json('data'), 'id'));
        $plan = $this->api('POST', $this->central, "super/tenant-purge/{$gone->id}/dry-run", $this->super)->assertOk()->json('data');
        $this->assertSame([1, 1, 2], [$plan['tables']['students'], $plan['files']['private'], $plan['files']['public'] + $plan['files']['private']]);
        $this->assertSame(1, Institution::whereKey($gone->id)->count(), 'a dry run removes nothing');

        $this->api('POST', $this->central, "super/tenant-purge/{$gone->id}/execute", $this->super, ['confirm_slug' => 'gone'])->assertStatus(422);       // no written confirmation
        $this->api('POST', $this->central, "super/tenant-purge/{$gone->id}/execute", $this->super, ['confirm_slug' => 'kept', 'confirm_export_sent' => true])
            ->assertStatus(422)->assertJsonPath('error', 'confirm_name_mismatch');
        $this->api('POST', $this->central, "super/tenant-purge/{$gone->id}/execute", $this->super, ['confirm_slug' => 'gone', 'confirm_export_sent' => true])->assertOk();

        foreach (TenantPurgeService::ORDER as $t) $this->assertSame(0, DB::table($t)->where('institution_id', $gone->id)->count(), "{$t} still has rows");
        $this->assertNull(Institution::find($gone->id));
        $this->assertSame([[], []], [Storage::disk('private')->allFiles("institutions/{$gone->id}"), Storage::disk('public')->allFiles("institutions/{$gone->id}")]);
        $this->assertSame([0, 0], [DB::table('personal_access_tokens')->where('tokenable_id', $admin->id)->count(), OtpToken::where('user_id', $admin->id)->count()]);

        // the other institution is untouched
        $this->assertNotNull(Institution::find($kept->id));
        $this->assertSame(1, Tenancy::as($kept, fn () => \App\Models\Student::count()));
        $this->assertNotEmpty(Storage::disk('private')->allFiles(StudentFiles::dir($keptStudent)));
        $this->assertSame([1, 1], [DB::table('personal_access_tokens')->where('tokenable_id', $keptAdmin->id)->count(), OtpToken::where('user_id', $keptAdmin->id)->count()]);

        // one platform audit row with counts only
        $row = AuditLog::anyInstitution()->where('action', 'tenant.purged')->sole();
        $this->assertSame([null, $this->super->id, $gone->id], [$row->institution_id, (int) $row->user_id, (int) $row->model_id]);
        $this->assertStringNotContainsString('Child', json_encode($row->new_data));
    }

    public function test_only_after_30_days_and_only_the_super_admin(): void
    {
        [$recent] = $this->populate('recent');
        [$active, $activeAdmin] = $this->populate('active');
        $this->suspend($recent, 10);
        foreach ([$recent, $active] as $i) {
            $this->api('POST', $this->central, "super/tenant-purge/{$i->id}/dry-run", $this->super)->assertStatus(422)->assertJsonPath('error', 'purge_not_eligible');
        }
        $this->assertSame([], $this->api('GET', $this->central, 'super/tenant-purge/candidates', $this->super)->json('data'));

        $expired = $this->makeInstitution('expired', 'school', 'expired');
        $expired->forceFill(['subscription_expires_at' => now()->subDays(40)])->save();
        $this->assertSame([$expired->id], array_column($this->api('GET', $this->central, 'super/tenant-purge/candidates', $this->super)->json('data'), 'id'));

        $this->api('GET', $this->central, 'super/tenant-purge/candidates', $activeAdmin)->assertForbidden();
        $this->api('POST', $this->hostOf($active), "super/tenant-purge/{$expired->id}/dry-run", $this->super)->assertNotFound();
    }

    public function test_the_shell_command_is_a_dry_run_unless_told_otherwise(): void
    {
        $i = $this->makeInstitution('shell', 'school', 'expired');
        $i->forceFill(['subscription_expires_at' => now()->subDays(40)])->save();
        $this->artisan('tenant:purge', ['institution' => $i->id])->assertSuccessful();
        $this->assertNotNull(Institution::find($i->id));
        $this->artisan('tenant:purge', ['institution' => $i->id, '--execute' => true, '--confirm' => 'wrong'])->assertFailed();
        $this->artisan('tenant:purge', ['institution' => $i->id, '--execute' => true, '--confirm' => 'shell'])->assertSuccessful();
        $this->assertNull(Institution::find($i->id));
    }
}

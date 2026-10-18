<?php

namespace Tests\Feature;

use App\Models\Institution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class TerminologyTest extends TestCase
{
    use RefreshDatabase;

    public function test_term_differs_by_institution_type(): void
    {
        $expected = ['school' => 'শাখা', 'college' => 'শাখা', 'coaching' => 'ব্যাচ', 'private_batch' => 'ব্যাচ'];
        $programs = [];
        foreach ($expected as $type => $batch) {
            $i = $this->makeInstitution("t-{$type}", $type);
            $this->asTenant($i, function () use ($batch, $type, &$programs) {
                $this->assertSame($batch, term('batch', 'bn'), $type);
                $programs[$type] = term('program', 'en');
            });
        }
        $this->assertSame(['school' => 'Class', 'college' => 'Class & Group', 'coaching' => 'Course', 'private_batch' => 'Subject'], $programs);
    }

    public function test_the_institution_override_wins_and_unknown_keys_fall_back_to_the_key(): void
    {
        $madrasa = Institution::create(['name' => 'M', 'slug' => 'madrasa', 'institution_type' => 'school', 'status' => 'active',
            'terminology' => ['program' => ['bn' => 'জামাত']]]);

        $this->asTenant($madrasa, function () {
            $this->assertSame('জামাত', term('program', 'bn'));
            $this->assertSame('Class', term('program', 'en'), 'a locale without an override falls back to the type default');
            $this->assertSame('no_such_term', term('no_such_term'));
        });
    }

    public function test_every_type_defines_the_same_term_keys_in_bn_en_and_ar(): void
    {
        $keys = null;
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            $terms = config("institution_types.{$type}.terms");
            $keys ??= array_keys($terms);
            $this->assertSame($keys, array_keys($terms), "{$type} term keys differ");
            foreach ($terms as $key => $byLocale) $this->assertSame(['bn', 'en', 'ar'], array_keys($byLocale), "{$type}.{$key}");
        }
    }

    public function test_admin_reads_the_effective_terms_with_every_key(): void
    {
        $coaching = $this->makeInstitution('alokito', 'coaching');
        $admin = $this->makeUser($coaching, 'admin');

        $res = $this->api('GET', $this->hostOf($coaching), 'admin/settings/terminology', $admin)->assertOk();

        $this->assertSame(array_keys(config('institution_types.coaching.terms')), array_keys($res->json('data.effective')));
        $this->assertSame('ব্যাচ', $res->json('data.effective.batch.bn'));
    }

    public function test_admin_overrides_a_term_and_the_bootstrap_cache_is_cleared(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $admin = $this->makeUser($school, 'admin');
        Cache::put("bootstrap:{$school->id}", 'stale', 600);

        $this->api('PUT', $this->hostOf($school), 'admin/settings/terminology', $admin, ['terminology' => ['program' => ['bn' => ' জামাত ', 'en' => '']]])
            ->assertOk()->assertJson(['data' => ['effective' => ['program' => ['bn' => 'জামাত', 'en' => 'Class']]]]);

        $this->assertSame(['program' => ['bn' => 'জামাত']], $school->fresh()->terminology);
        $this->assertNull(Cache::get("bootstrap:{$school->id}"));

        $this->api('PUT', $this->hostOf($school), 'admin/settings/terminology', $admin, ['terminology' => []])->assertOk();
        $this->assertNull($school->fresh()->terminology, 'an empty map clears every override');
    }

    public function test_unknown_keys_and_locales_are_rejected(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $admin = $this->makeUser($school, 'admin');

        $this->api('PUT', $this->hostOf($school), 'admin/settings/terminology', $admin, ['terminology' => ['hostel' => ['bn' => 'x']]])
            ->assertStatus(422)->assertJson(['error' => 'validation_failed'])->assertJsonValidationErrors(['terminology.hostel']);
        $this->api('PUT', $this->hostOf($school), 'admin/settings/terminology', $admin, ['terminology' => ['batch' => ['fr' => 'x']]])
            ->assertStatus(422)->assertJsonValidationErrors(['terminology.batch.fr']);
        $this->api('PUT', $this->hostOf($school), 'admin/settings/terminology', $admin, ['terminology' => ['batch' => ['bn' => str_repeat('ক', 51)]]])
            ->assertStatus(422);
    }

    public function test_only_this_institutions_admin_may_change_terms(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $other = $this->makeInstitution('other');
        $path = 'admin/settings/terminology';

        $this->api('GET', $this->hostOf($school), $path)->assertUnauthorized()->assertJson(['error' => 'unauthenticated']);
        $this->api('PUT', $this->hostOf($school), $path, $this->makeUser($school, 'teacher'), ['terminology' => []])->assertForbidden()->assertJson(['error' => 'forbidden']);
        $this->api('PUT', $this->hostOf($school), $path, $this->makeUser($other, 'admin'), ['terminology' => []])->assertForbidden()->assertJson(['error' => 'institution_mismatch']);
        $this->api('GET', 'admin.schoolapp.com', $path, $this->makeUser(null, 'super_admin'))->assertNotFound()->assertJson(['error' => 'institution_not_found']);
    }
}

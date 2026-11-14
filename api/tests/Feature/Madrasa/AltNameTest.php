<?php

namespace Tests\Feature\Madrasa;

use App\Models\{Batch, Program, Subject, User};
use App\Support\{AltName, Tenancy};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D214 MAD.3 (docs/modules/madrasa.md section 3): second-language names - entered on the student, teacher, program, batch and
// subject forms, found by search, and printed beside the main name on documents only while settings.alt_name_locale is on.
class AltNameTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_forms_search_setting_and_documents(): void
    {
        Queue::fake();
        $this->travelTo('2026-11-14 10:00:00');
        $s = $this->school('alt');
        $h = $s['host'];
        $admin = $s['admin'];

        // the forms keep the second name
        $st = $this->api('POST', $h, 'students', $admin, ['name' => 'আব্দুল্লাহ', 'name_alt' => 'عبد الله', 'guardian_phone' => '01711000009'])->assertCreated()->json('data');
        $this->assertSame('عبد الله', $st['name_alt']);
        $this->api('PUT', $h, "students/{$st['id']}", $admin, ['name_alt' => 'عبد الله بن عمر'])->assertOk()->assertJsonPath('data.name_alt', 'عبد الله بن عمر');
        $this->api('PUT', $h, "students/{$st['id']}", $admin, ['name_alt' => str_repeat('ع', 151)])->assertStatus(422);
        $t = $this->api('POST', $h, 'teachers', $admin, ['name' => 'মাওলানা রফিক', 'name_alt' => 'رفيق', 'phone' => '01811000001'])->assertCreated()->json('data');
        $this->assertSame('رفيق', $t['name_alt']);
        $this->api('PUT', $h, "programs/{$s['p']->id}", $admin, ['name_alt' => 'الصف العاشر'])->assertOk()->assertJsonPath('data.name_alt', 'الصف العاشر');
        $this->api('PUT', $h, "batches/{$s['a']->id}", $admin, ['name_alt' => 'أ'])->assertOk()->assertJsonPath('data.name_alt', 'أ');
        $this->api('PUT', $h, "subjects/{$s['bangla']->id}", $admin, ['name_alt' => 'البنغالية'])->assertOk()->assertJsonPath('data.name_alt', 'البنغالية');
        Tenancy::as($s['i'], function () use ($s) {
            $this->assertSame(['الصف العاشر', 'أ', 'البنغالية'], [Program::find($s['p']->id)->name_alt, Batch::find($s['a']->id)->name_alt, Subject::find($s['bangla']->id)->name_alt]);
        });

        // search finds either name
        $this->assertSame([$st['id']], array_column($this->api('GET', $h, 'students?q=' . urlencode('بن عمر'), $admin)->assertOk()->json('data'), 'id'));
        $this->assertSame([$t['id']], array_column($this->api('GET', $h, 'teachers?q=' . urlencode('رفيق'), $admin)->assertOk()->json('data'), 'id'));

        // the setting: off by default; ar / en / off
        $this->assertNull($this->api('GET', $h, 'admin/settings/general', $admin)->json('data.alt_name_locale'));
        $user = User::find(Tenancy::as($s['i'], fn () => \App\Models\Student::find($st['id'])->user_id));
        $this->bindTenant($s['i']->fresh());
        $this->assertNull(AltName::of($user), 'off: nothing is printed');
        $this->assertNull(AltName::institution());
        $this->api('PUT', $h, 'admin/settings/general', $admin, ['alt_name_locale' => 'fr'])->assertStatus(422);
        $this->api('PUT', $h, 'admin/settings/general', $admin, ['alt_name_locale' => 'ar', 'name_alt' => 'المدرسة'])->assertOk()->assertJsonPath('data.alt_name_locale', 'ar')->assertJsonPath('data.name_alt', 'المدرسة');
        $this->bindTenant($s['i']->fresh());
        $this->assertSame(['عبد الله بن عمر', 'المدرسة', 'rtl'], [AltName::of($user), AltName::institution(), AltName::dir()]);
        $this->assertSame('عبد الله بن عمر', AltName::of(User::select('id', 'name')->find($user->id)), 'a caller that selected only id,name still gets it');

        // documents: the heading and the student line carry both names; off again -> gone
        $html = fn () => view('pdf.admit-cards', ['exam' => ['name' => 'X', 'academic_year' => 2026, 'center' => null, 'instructions' => null], 'subjects' => [],
            'cards' => [['name' => $user->name, 'name_alt' => AltName::of($user), 'code' => 'S', 'roll' => 1, 'class' => 'C', 'photo' => null, 'qr' => null]],
            'institution' => Tenancy::current(), 'theme' => app(\App\Services\ThemeService::class)->getTheme(Tenancy::current()), 'locale' => 'bn', 'dir' => 'ltr', 'logo' => null])->render();
        $on = $html();
        $this->assertStringContainsString('<div class="alt-name" dir="rtl">المدرسة</div>', $on);
        $this->assertStringContainsString('عبد الله بن عمر', $on);
        $this->api('PUT', $h, 'admin/settings/general', $admin, ['alt_name_locale' => null])->assertOk()->assertJsonPath('data.alt_name_locale', null);
        $this->bindTenant($s['i']->fresh());
        $off = $html();
        $this->assertStringNotContainsString('المدرسة', $off);
        $this->assertStringNotContainsString('عبد الله', $off);
    }
}

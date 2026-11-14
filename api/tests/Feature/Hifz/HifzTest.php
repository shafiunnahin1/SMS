<?php

namespace Tests\Feature\Hifz;

use App\Models\{AuditLog, BatchTeacher, HifzRecord, Teacher};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D214 MAD.1 (docs/modules/madrasa.md 1.2, 1.3, 1.5, 1.6): the opt-in switch; range rules (HifzRange); 85 sabaq pages => 4 paras,
// 14.17% at 20 pages a para and 5 paras at 15 (HifzProgress); the stale list (HifzStale); a teacher only for their batch, own edits
// within 24 hours, the admin any time; a parent only when show_parents is on (HifzAccess); the monthly PDF.
class HifzTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private function entry(int $student, array $over = []): array
    {
        return array_replace(['student_id' => $student, 'record_date' => '2026-11-10', 'kind' => 'sabaq', 'from_surah' => 2, 'from_ayah' => 1, 'to_surah' => 2, 'to_ayah' => 20, 'quality' => 4, 'mistakes' => 1], $over);
    }

    public function test_switch_ranges_progress_stale_access_pdf(): void
    {
        $this->travelTo('2026-11-14 10:00:00');
        $s = $this->school('hifz');   // Karim; Mine and Other in batch A, Sister in B; the parent of Mine and Sister
        $h = $s['host'];
        $admin = $s['admin'];
        $karim = $s['karimUser'];
        $mine = $s['mine']->id;

        // off until the admin switches it on
        $this->api('GET', $h, 'hifz/records', $admin)->assertForbidden()->assertJsonPath('error', 'module_disabled');
        $this->assertFalse($this->api('GET', $h, 'admin/settings/hifz', $admin)->assertOk()->json('data.enabled'));
        $this->api('PUT', $h, 'admin/settings/hifz', $karim, ['enabled' => true, 'pages_per_para' => 20, 'stale_days' => 7, 'show_parents' => false])->assertForbidden();
        $this->api('PUT', $h, 'admin/settings/hifz', $admin, ['enabled' => true, 'pages_per_para' => 20, 'stale_days' => 7, 'show_parents' => false])->assertOk()->assertJsonPath('data.enabled', true);
        Tenancy::as($s['i'], fn () => BatchTeacher::create(['batch_id' => $s['a']->id, 'teacher_id' => Teacher::where('user_id', $karim->id)->value('id'), 'subject_id' => $s['bangla']->id]));

        // ranges (no Quran data file: no ayah upper bound)
        $this->api('POST', $h, 'hifz/records', $karim, $this->entry($mine, ['from_surah' => 3, 'to_surah' => 2]))->assertStatus(422)->assertJsonPath('error', 'hifz_range_order');
        $this->api('POST', $h, 'hifz/records', $karim, $this->entry($mine, ['to_ayah' => 0]))->assertStatus(422);
        $this->api('POST', $h, 'hifz/records', $karim, $this->entry($mine, ['from_surah' => 115]))->assertStatus(422);
        $this->api('POST', $h, 'hifz/records', $karim, $this->entry($mine, ['quality' => 6]))->assertStatus(422);
        $this->api('POST', $h, 'hifz/records', $karim, $this->entry($mine, ['para_no' => 31]))->assertStatus(422);
        $this->api('POST', $h, 'hifz/records', $karim, $this->entry($mine, ['kind' => 'other']))->assertStatus(422);
        $this->api('POST', $h, 'hifz/records', $karim, $this->entry($mine, ['to_ayah' => 400]))->assertCreated();   // no upper bound without the data file
        // a student of another batch is not his
        $this->api('POST', $h, 'hifz/records', $karim, $this->entry($s['sister']->id))->assertNotFound();

        // progress: 8 sabaq sessions, 85 pages (one revision does not count)
        foreach (['5', '6.5', '4', '8', '10', '12', '15', '24.5'] as $n => $p) {
            $this->api('POST', $h, 'hifz/records', $admin, $this->entry($mine, ['record_date' => sprintf('2026-11-%02d', $n + 1), 'pages' => $p]))->assertCreated();
        }
        $this->api('POST', $h, 'hifz/records', $karim, $this->entry($mine, ['kind' => 'manzil', 'pages' => 30]))->assertCreated();
        $p = $this->api('GET', $h, "hifz/students/{$mine}/progress", $karim)->assertOk()->json('data.progress');
        $this->assertSame(['85.0', 4, '14.17'], [$p['pages'], $p['paras'], $p['percent']]);
        $this->api('PUT', $h, 'admin/settings/hifz', $admin, ['enabled' => true, 'pages_per_para' => 15, 'stale_days' => 7, 'show_parents' => false])->assertOk();
        $this->assertSame(5, $this->api('GET', $h, "hifz/students/{$mine}/progress", $admin)->json('data.progress.paras'));

        // stale: Other has no sabaq in 7 days, Mine had one on 2026-11-10
        $o = $this->api('GET', $h, "hifz/batches/{$s['a']->id}/overview", $karim)->assertOk()->json('data.students');
        $this->assertEqualsCanonicalizing([[$mine, false], [$s['other']->id, true]], array_map(fn ($x) => [$x['student']['id'], $x['stale']], $o));
        $this->assertCount(2, array_filter($this->api('GET', $h, "hifz/batches/{$s['a']->id}/overview?stale_days=1", $karim)->json('data.students'), fn ($x) => $x['stale']));
        $this->api('GET', $h, "hifz/batches/{$s['b']->id}/overview", $karim)->assertNotFound();

        // edits: Karim his own within 24 hours; not the admin's entry; the admin any time
        $his = Tenancy::as($s['i'], fn () => HifzRecord::where('kind', 'manzil')->value('id'));
        $adminRow = Tenancy::as($s['i'], fn () => HifzRecord::whereNull('teacher_id')->value('id'));
        $this->api('PUT', $h, "hifz/records/{$his}", $karim, $this->entry($mine, ['kind' => 'sabqi']) + [])->assertStatus(422);   // student_id is prohibited on edit
        $body = array_diff_key($this->entry($mine, ['kind' => 'sabqi']), ['student_id' => 1]);
        $this->api('PUT', $h, "hifz/records/{$his}", $karim, $body)->assertOk()->assertJsonPath('data.kind', 'sabqi');
        $this->api('PUT', $h, "hifz/records/{$adminRow}", $karim, $body)->assertNotFound();
        $this->travelTo('2026-11-15 11:00:00');
        $this->api('PUT', $h, "hifz/records/{$his}", $karim, $body)->assertStatus(422)->assertJsonPath('error', 'hifz_edit_window');
        $this->api('DELETE', $h, "hifz/records/{$his}", $karim)->assertStatus(422);
        $this->api('DELETE', $h, "hifz/records/{$his}", $admin)->assertOk();

        // lists: Karim sees only his batch's students
        $this->assertSame([$mine], array_values(array_unique(array_column(array_column($this->api('GET', $h, 'hifz/records', $karim)->json('data'), 'student'), 'id'))));

        // parents: only when show_parents is on, and only their own child
        $this->api('GET', $h, "parent/children/{$mine}/hifz", $s['parent'])->assertForbidden()->assertJsonPath('error', 'hifz_hidden_from_parents');
        $this->api('PUT', $h, 'admin/settings/hifz', $admin, ['enabled' => true, 'pages_per_para' => 20, 'stale_days' => 7, 'show_parents' => true])->assertOk();
        $this->assertSame('14.17', $this->api('GET', $h, "parent/children/{$mine}/hifz", $s['parent'])->assertOk()->json('data.progress.percent'));
        $this->api('GET', $h, "parent/children/{$s['other']->id}/hifz", $s['parent'])->assertNotFound();

        // the monthly PDF
        $pdf = $this->api('GET', $h, "hifz/reports/monthly.pdf?student_id={$mine}&month=2026-11", $karim)->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $pdf->getContent());
        $this->api('GET', $h, "hifz/reports/monthly.pdf?student_id={$s['sister']->id}&month=2026-11", $karim)->assertNotFound();

        Tenancy::as($s['i'], fn () => $this->assertSame(1, AuditLog::where('action', 'hifz.deleted')->count()));
        // switched off again: the module answers 403
        $this->api('PUT', $h, 'admin/settings/hifz', $admin, ['enabled' => false, 'pages_per_para' => 20, 'stale_days' => 7, 'show_parents' => true])->assertOk();
        $this->api('GET', $h, 'hifz/records', $admin)->assertForbidden();
    }

    public function test_coaching_cannot_switch_it_on(): void
    {
        $i = $this->makeInstitution('hifzcoach', 'coaching');
        $this->api('PUT', $this->hostOf($i), 'admin/settings/hifz', $this->makeUser($i, 'admin'), ['enabled' => true, 'pages_per_para' => 20, 'stale_days' => 7, 'show_parents' => false])
            ->assertStatus(422)->assertJsonPath('error', 'module_not_available');
    }
}

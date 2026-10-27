<?php

namespace Tests\Feature\Ai;

use App\Models\{AiAttachment, Batch, Program, User};
use App\Services\Ai\OcrService;
use App\Services\Privacy\StudentErasureService;
use App\Services\StudentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Process, Storage};
use Tests\TestCase;

// D166 (5) AI-Q5: a photo is read by the server's own Tesseract (the process is faked here; the real run is measured in
// docs/PROGRESS.md), the tidied text and its formula lines come back for the user to correct, an unsure reading is reported
// unsupported, only question askers may send photos, the file is private and goes after one day or at once on erasure.
class AiAttachmentTest extends TestCase
{
    use RefreshDatabase;

    /** a Tesseract TSV with one word line per entry and the given confidence */
    private static function tsv(array $lines, float $conf): string
    {
        $out = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n";
        foreach ($lines as $n => $line) foreach (explode(' ', $line) as $w => $word) $out .= "5\t1\t1\t1\t" . ($n + 1) . "\t" . ($w + 1) . "\t0\t0\t1\t1\t{$conf}\t{$word}\n";
        return $out;
    }

    private function send($i, User $u, float $conf = 92.5, array $lines = ['গাড়িটির বেগ কত |', 'x + 5 = l2'])
    {
        Process::fake(['*' => Process::result(self::tsv($lines, $conf))]);
        $this->app['auth']->forgetGuards();
        return $this->withHeaders(['Authorization' => 'Bearer ' . $u->createToken('t')->plainTextToken])
            ->post("http://{$this->hostOf($i)}/api/v1/ai/attachments", ['image' => UploadedFile::fake()->image('q.png', 40, 20)]);
    }

    public function test_a_photo_is_read_tidied_and_kept_privately_for_one_day(): void
    {
        Storage::fake('private');
        $i = $this->makeInstitution('ocr-one', 'school');
        $student = $this->makeUser($i, 'student');
        $r = $this->send($i, $student)->assertCreated()->json('data');
        $this->assertSame('done', $r['status']);
        $this->assertSame("গাড়িটির বেগ কত।\nx + 5 = 12", $r['text'], 'the Bangla full stop read as "|" and an l inside a number are fixed');
        $this->assertSame([['line' => 1, 'text' => 'x + 5 = 12', 'latex' => 'x + 5 = 12']], $r['formulas'], 'the formula line is offered for MathLive');
        Process::assertRan(fn ($p) => in_array('ben+eng', (array) $p->command, true) && in_array('tsv', (array) $p->command, true));

        $row = Tenancy::as($i, fn () => AiAttachment::findOrFail($r['id']));
        $this->assertStringStartsWith("institutions/{$i->id}/ai-attachments/{$student->id}/", $row->path);
        Storage::disk('private')->assertExists($row->path);
        $this->assertEqualsWithDelta(now()->addDay()->timestamp, $row->expires_at->timestamp, 5);

        // after a day the purge removes the file and the row; a fresh one stays
        $fresh = $this->send($i, $student)->json('data.id');
        Tenancy::as($i, fn () => AiAttachment::whereKey($row->id)->update(['expires_at' => now()->subMinute()]));
        $this->artisan('ai:attachments-purge')->expectsOutputToContain('deleted 1')->assertSuccessful();
        Storage::disk('private')->assertMissing($row->path);
        $this->assertSame([$fresh], Tenancy::as($i, fn () => AiAttachment::pluck('id')->all()));
    }

    public function test_an_unsure_reading_is_reported_unsupported_not_guessed(): void
    {
        Storage::fake('private');
        $i = $this->makeInstitution('ocr-unsure', 'school');
        $r = $this->send($i, $this->makeUser($i, 'teacher'), 41.0)->assertCreated();
        $r->assertJsonPath('data.status', 'unsupported')->assertJsonPath('data.text', '')->assertJsonPath('data.formulas', [])
            ->assertJsonPath('message', __('ai.ocr.unsupported'));
        Process::fake(['*' => Process::result('', 'error', 1)]);
        $this->assertSame('failed', app(OcrService::class)->read('/no/such/file.png')['status']);
    }

    public function test_only_question_askers_with_the_module_on_may_send_photos(): void
    {
        Storage::fake('private');
        $i = $this->makeInstitution('ocr-roles', 'school');
        foreach (['parent', 'accountant'] as $role) $this->send($i, $this->makeUser($i, $role))->assertForbidden();
        $staff = User::create(['institution_id' => $i->id, 'name' => 'S', 'role' => 'institution_staff', 'phone' => '01755550001', 'password' => 'Staff-pass-2026', 'is_active' => true]);
        $this->assertContains($this->send($i, $staff)->status(), [403, 409, 428], 'staff get the help guide only');
        $this->assertSame(0, Tenancy::as($i, fn () => AiAttachment::count()));
        $i->forceFill(['enabled_modules' => array_replace($i->enabled_modules ?? [], ['ai_assistant' => false])])->save();
        $this->assertContains($this->send($i, $this->makeUser($i, 'admin'))->status(), [403, 404], 'module off');
    }

    public function test_erasing_a_student_deletes_their_photos_at_once(): void
    {
        Storage::fake('private');
        $i = $this->makeInstitution('ocr-erase', 'school');
        $student = Tenancy::as($i, fn () => app(StudentService::class)->create(['name' => 'Rahim', 'guardian_phone' => '01711112222'],
            Batch::create(['program_id' => Program::create(['name' => 'P'])->id, 'name' => 'B']))->fresh());
        $user = $student->user;
        $this->assertNotNull($user, 'the student has a login');
        $path = "institutions/{$i->id}/ai-attachments/{$user->id}/q.png";   // the upload itself is covered above (a new login must change its password first)
        Storage::disk('private')->put($path, 'png');
        Tenancy::as($i, fn () => AiAttachment::create(['institution_id' => $i->id, 'user_id' => $user->id, 'path' => $path, 'mime' => 'image/png', 'size_bytes' => 3,
            'ocr_status' => 'done', 'expires_at' => now()->addDay()]));
        $admin = $this->makeUser($i, 'admin');
        $this->actingAs($admin);
        Tenancy::as($i, fn () => app(StudentErasureService::class)->anonymize($student, $admin->id));
        Storage::disk('private')->assertMissing($path);
        $this->assertSame(0, Tenancy::as($i, fn () => AiAttachment::count()));
    }

    public function test_tidy_and_formula_helpers(): void
    {
        $this->assertSame('বেগ কত।', OcrService::tidy('বেগ  কত |'));
        $this->assertSame('1005', OcrService::tidy('1OO5'));
        $this->assertFalse(OcrService::isFormula('বাংলাদেশের রাজধানী কোথায়?'));
        $this->assertTrue(OcrService::isFormula('2a × 3b = 6ab'));
        $this->assertSame('2a \\times 3b = 6ab', OcrService::latex('2a x 3b = 6ab'), 'a spaced x between terms is the times sign');
        $this->assertSame('\\sqrt{16} = 4', OcrService::latex('√(16) = ৪'));
    }
}

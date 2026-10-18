<?php

namespace Tests\Feature\Security;

use App\Models\{Batch, Program};
use App\Services\StudentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// docs/ops/security-checklist.md "Input Validation & Injection": SQL injection and XSS probes, malformed JSON, the import's
// 5 MB limit (student-import.md), very large amounts - each answered with a 4xx or harmless data, never a 500.
class InputHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_injection_and_markup_are_data_and_bad_input_is_a_4xx(): void
    {
        Queue::fake();
        $i = $this->makeInstitution('probe');
        $admin = $this->makeUser($i, 'admin');
        $host = $this->hostOf($i);
        $program = $this->api('POST', $host, 'programs', $admin, ['name' => 'Class 6'])->assertCreated()->json('data.id');
        $batch = $this->api('POST', $host, 'batches', $admin, ['program_id' => $program, 'name' => 'A'])->assertCreated()->json('data.id');
        Tenancy::as($i, fn () => app(StudentService::class)->create(['name' => 'Rafi', 'guardian_phone' => '01733330001'], Batch::find($batch), ['roll_no' => 1]));

        // SQL injection in search fields: bound as data - matches nothing, breaks nothing
        foreach (['students', 'teachers'] as $list) {
            $this->api('GET', $host, $list . '?q=' . rawurlencode("' OR '1'='1"), $admin)->assertOk()->assertJsonCount(0, 'data');
        }
        $this->api('GET', $host, 'students?q=Rafi', $admin)->assertOk()->assertJsonCount(1, 'data');

        // XSS in a name: stored and returned as the same text (JSON-escaped); React prints it as text
        $xss = "<script>alert('xss')</script>";
        $id = $this->api('POST', $host, 'programs', $admin, ['name' => $xss])->assertCreated()->json('data.id');
        $res = $this->api('GET', $host, "programs/{$id}", $admin)->assertOk()->assertJsonPath('data.name', $xss);
        $this->assertStringStartsWith('application/json', $res->headers->get('Content-Type'), 'never served as HTML');
        $this->assertSame($xss, Tenancy::as($i, fn () => Program::find($id)->name));

        // malformed JSON is refused as invalid input
        $token = $admin->createToken('t')->plainTextToken;
        $this->call('POST', "http://{$host}/api/v1/programs", [], [], [], ['HTTP_AUTHORIZATION' => "Bearer {$token}", 'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json'], '{"name": "Class 7",')->assertStatus(422);

        // very large numbers in amount fields
        $this->api('POST', $host, 'programs', $admin, ['name' => 'Big', 'course_fee' => '99999999999999999999'])->assertStatus(422);
        $this->api('POST', $host, 'fees/collect', $admin, ['student_id' => 1, 'payment_method' => 'cash',
            'lines' => [['key' => '1:1:2026-01', 'paid_amount' => '1e308']]])->assertStatus(422);

        // the import file: 5 MB at most, spreadsheet types only
        $this->api('POST', $host, 'imports', $admin, ['kind' => 'students', 'file' => UploadedFile::fake()->create('big.xlsx', 5121)])->assertStatus(422);
        $this->api('POST', $host, 'imports', $admin, ['kind' => 'students', 'file' => UploadedFile::fake()->create('shell.php', 10, 'application/x-php')])->assertStatus(422);
    }
}

<?php

namespace Tests\Feature\Files;

use App\Models\Batch;
use App\Models\Program;
use App\Services\{PdfService, StudentService};
use App\Support\{StudentFiles, Tenancy};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Queue, Storage};
use Tests\TestCase;

// docs/architecture/file-storage.md section 5 "FilePathPrefixTest": every upload-backed path starts with institutions/{id}/; student
// files sit under students/{sid}/. Covers the R1 writers: student photo (via the API), institution logo, temporary PDF.
class FilePathPrefixTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_stored_path_is_inside_its_institution_and_student_files_inside_the_student(): void
    {
        Queue::fake();
        Storage::fake('private');
        Storage::fake('public');
        $i = $this->makeInstitution('paths', 'school');
        $admin = $this->makeUser($i, 'admin');
        $host = $this->hostOf($i);
        $batch = Tenancy::as($i, fn () => Batch::create(['program_id' => Program::create(['name' => 'P'])->id, 'name' => 'A']));

        $sid = $this->api('POST', $host, 'students', $admin, ['name' => 'P', 'guardian_phone' => '01711115555', 'batch_id' => $batch->id,
            'photo' => UploadedFile::fake()->image('x.jpg')])->assertCreated()->json('data.id');
        $this->api('PUT', $host, "students/{$sid}", $admin, ['photo' => UploadedFile::fake()->image('y.png')])->assertOk();
        $this->api('POST', $host, 'admin/theme/logo', $admin, ['logo' => UploadedFile::fake()->image('logo.png', 200, 200)])->assertOk();
        Tenancy::as($i, fn () => app(PdfService::class)->storeTemporary('%PDF-1.4'));

        $all = array_merge(Storage::disk('private')->allFiles(), Storage::disk('public')->allFiles());
        $this->assertNotEmpty($all);
        foreach ($all as $path) $this->assertStringStartsWith("institutions/{$i->id}/", $path);

        $student = Tenancy::as($i, fn () => \App\Models\Student::find($sid));
        $photos = array_values(array_filter($all, fn ($p) => str_contains($p, '/photo-')));
        $this->assertSame([$student->photo], $photos, 'one photo: the replaced one was deleted');
        $this->assertStringStartsWith(StudentFiles::dir($student) . '/', $student->photo);
    }
}

<?php

namespace App\Support;

use App\Models\Student;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

// docs/architecture/file-storage.md section 2: every file bound to a student lives under institutions/{inst}/students/{sid}/ on the
// private disk, named by a server UUID with the MIME-sniffed extension - so deleting / erasing a student is ONE deleteDirectory.
final class StudentFiles
{
    public static function dir(Student $s): string
    {
        return "institutions/{$s->institution_id}/students/{$s->id}";
    }

    /** Replaces the photo; returns the stored relative path */
    public static function storePhoto(Student $s, UploadedFile $file): string
    {
        $path = $file->storeAs(self::dir($s), 'photo-' . Str::uuid() . '.' . $file->extension(), 'private');
        if ($s->photo && $s->photo !== $path) Storage::disk('private')->delete($s->photo);
        return $path;
    }

    /** A short-lived signed link (private files are never url()) */
    public static function photoUrl(Student $s): ?string
    {
        return $s->photo ? Storage::disk('private')->temporaryUrl($s->photo, now()->addMinutes(10)) : null;
    }

    public static function deleteAll(Student $s): void
    {
        Storage::disk('private')->deleteDirectory(self::dir($s));
    }
}

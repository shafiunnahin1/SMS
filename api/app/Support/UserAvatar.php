<?php
namespace App\Support;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class UserAvatar
{
    public static function store(User $user, UploadedFile $file): string
    {
        // Decode/re-encode raster pixels: EXIF/GPS and appended non-image payloads never reach storage.
        $image = @imagecreatefromstring($file->get());
        if (!$image) throw ValidationException::withMessages(['avatar' => __('errors.activation_invalid')]);
        $png = $file->getMimeType() === 'image/png';
        ob_start();
        try { $ok = $png ? imagepng($image) : imagejpeg($image, null, 90); $bytes = ob_get_contents(); }
        finally { ob_end_clean(); imagedestroy($image); }
        if (!$ok || !is_string($bytes)) throw ValidationException::withMessages(['avatar' => __('errors.activation_invalid')]);
        $path = 'institutions/'.$user->institution_id.'/users/'.$user->id.'/avatar-'.Str::uuid().($png ? '.png' : '.jpg');
        if (!Storage::disk('private')->put($path, $bytes, ['visibility' => 'private'])) throw new \RuntimeException('Avatar storage unavailable');
        return $path;
    }
    public static function owned(User $user, ?string $path): bool
    {
        $prefix = preg_quote('institutions/'.$user->institution_id.'/users/'.$user->id.'/avatar-', '~');
        return is_string($path) && preg_match('~\A'.$prefix.'[0-9a-f-]{36}\.(?:jpg|png)\z~D', $path) === 1;
    }
    public static function deleteOwned(User $user, ?string $path): void
    {
        if (self::owned($user, $path)) Storage::disk('private')->delete($path);
    }
    public static function url(User $user): ?string
    {
        return self::owned($user, $user->avatar) ? Storage::disk('private')->temporaryUrl($user->avatar, now()->addMinutes(5)) : null;
    }
}

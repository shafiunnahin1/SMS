<?php

namespace App\Support;

use App\Models\User;

// D214 MAD.3 (docs/modules/madrasa.md section 3): the second-language name printed beside the main one on documents. It is on when
// institutions.settings.alt_name_locale is `ar` or `en`; the names live in users.name_alt and institutions.settings.name_alt.
final class AltName
{
    public static function locale(): ?string
    {
        $l = (Tenancy::current()?->settings ?? [])['alt_name_locale'] ?? null;
        return in_array($l, ['ar', 'en'], true) ? $l : null;
    }

    /** the person's second-language name, or null when the feature is off or the name is empty */
    public static function of(?User $u): ?string
    {
        if (!$u || !self::locale()) return null;
        $alt = array_key_exists('name_alt', $u->getAttributes()) ? $u->name_alt : User::whereKey($u->id)->value('name_alt');   // callers often select only id,name
        return ($alt !== null && trim($alt) !== '') ? trim($alt) : null;
    }

    public static function institution(): ?string
    {
        if (!self::locale()) return null;
        $alt = (Tenancy::current()?->settings ?? [])['name_alt'] ?? null;
        return (is_string($alt) && trim($alt) !== '') ? trim($alt) : null;
    }

    /** `dir` for the second name: Arabic is right-to-left */
    public static function dir(): string
    {
        return self::locale() === 'ar' ? 'rtl' : 'ltr';
    }
}

<?php

namespace App\Support;

use App\Exceptions\BusinessException;
use App\Models\Institution;

// D214 MAD.4 (docs/modules/madrasa.md section 5): the institution's grading scale (settings.grading_scale, else the default),
// optional grade labels (label[locale] ?? grade) and the "labelled preset with an empty range" stop. The percentage -> grade
// logic itself is unchanged (docs/modules/grading.md): the first row, top-down, whose `min` the percentage reaches.
final class GradingScale
{
    public static function rows(?Institution $i = null): array
    {
        return (($i ?? Tenancy::current())?->settings ?? [])['grading_scale'] ?? config('grading.default_scale');
    }

    public static function preset(?Institution $i = null): string
    {
        $s = ($i ?? Tenancy::current())?->settings ?? [];
        return isset($s['grading_scale']) && ($s['grading_preset'] ?? null) === 'labelled' ? 'labelled' : 'bd_gpa';
    }

    public static function incomplete(?Institution $i = null): bool
    {
        foreach (self::rows($i) as $r) if (!isset($r['min']) || $r['min'] === '') return true;
        return false;
    }

    /** the rows to grade with; refuses while a range is empty */
    public static function rowsOrFail(): array
    {
        if (self::incomplete()) throw new BusinessException('fill the grade ranges first', 'grading_incomplete', 422);
        return array_map(fn ($r) => ['point' => $r['point'] ?? 0.00] + $r, self::rows());
    }

    /** what a person reads for a stored grade code */
    public static function label(?string $grade, ?string $locale = null): ?string
    {
        if ($grade === null) return null;
        $locale ??= app()->getLocale();
        foreach (self::rows() as $r) {
            if (($r['grade'] ?? null) === $grade) return ($r['label'][$locale] ?? null) ?: $grade;
        }
        return $grade;
    }
}

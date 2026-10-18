<?php

namespace App\Services;

use App\Models\Institution;

// institutions.settings JSON: defaults per institution type, and the parts /bootstrap may show (allow-list, never deny-list).
class InstitutionSettings
{
    /** Release 1 ships Bengali and English (ar arrives with Step 3.7, docs/I18N.md) */
    public const LOCALES = ['bn', 'en'];
    public const DIR = ['bn' => 'ltr', 'en' => 'ltr', 'ar' => 'rtl'];
    public const FEE_PRORATION = ['none', 'half_after_15'];

    /** GET|PUT /admin/settings/general keys - docs/modules/academic-structure.md, institution-types.md */
    public function general(Institution $i): array
    {
        $s = $i->settings ?? [];
        $smallTutor = $i->institution_type === 'private_batch';
        return [
            'fee_proration'  => $s['fee_proration'] ?? 'none',
            'use_programs'   => (bool) ($s['use_programs'] ?? !$smallTutor),
            'student_portal' => (bool) ($s['student_portal'] ?? !$smallTutor),
            'use_gpa'        => (bool) ($s['use_gpa'] ?? in_array($i->institution_type, ['school', 'college'], true)),
        ];
    }

    public function language(Institution $i): array
    {
        $s = $i->settings ?? [];
        $enabled = array_values(array_intersect(self::LOCALES, array_unique(['bn', ...($s['locales'] ?? ['bn', 'en'])])));
        $default = in_array($s['default_locale'] ?? 'bn', $enabled, true) ? $s['default_locale'] ?? 'bn' : 'bn';
        $sms = in_array($s['sms_locale'] ?? null, $enabled, true) ? $s['sms_locale'] : $default;
        return ['enabled' => $enabled, 'default' => $default, 'sms_locale' => $sms, 'terminology_preset' => $s['terminology_preset'] ?? null];
    }

    /** The ONLY settings /bootstrap may expose (docs/modules/public-website.md "Bootstrap Whitelist") */
    public function publicSettings(Institution $i): array
    {
        return $this->general($i) + ['public_site' => ['enabled' => (bool) (($i->settings ?? [])['public_site']['enabled'] ?? false)]];
    }

    public function merge(Institution $i, array $values): void
    {
        $i->forceFill(['settings' => array_merge($i->settings ?? [], $values)])->save();
        app(ThemeService::class)->flush($i);                 // also clears bootstrap:{id}
    }
}

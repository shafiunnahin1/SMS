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

    /** D197 AAD.1 (academics-advanced.md section 2): the dues block settings, `institutions.settings.fees`; both switches off by default */
    public function dueBlock(Institution $i): array
    {
        $f = ($i->settings ?? [])['fees'] ?? [];
        $t = $f['block_threshold'] ?? [];
        $mode = in_array($t['mode'] ?? null, ['amount', 'months', 'any'], true) ? $t['mode'] : 'amount';
        return ['block_admit_card' => (bool) ($f['block_admit_card'] ?? false), 'block_result' => (bool) ($f['block_result'] ?? false),
            'block_threshold' => ['mode' => $mode, 'value' => $mode === 'any' ? null : (string) ($t['value'] ?? ($mode === 'months' ? '1' : '1000'))],
            'block_message' => ($f['block_message'] ?? null) ?: null];
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

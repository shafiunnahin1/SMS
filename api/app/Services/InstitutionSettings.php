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

    /** D214 MAD.3 (madrasa.md section 3): second-language names - NOT part of general(), which feeds the bootstrap allow list */
    public function altName(Institution $i): array
    {
        $s = $i->settings ?? [];
        return ['alt_name_locale' => in_array($s['alt_name_locale'] ?? null, ['ar', 'en'], true) ? $s['alt_name_locale'] : null, 'name_alt' => $s['name_alt'] ?? null];
    }

    /** D214 MAD.4 (madrasa.md section 5): the grading preset, its rows and whether a range is still empty */
    public function grading(Institution $i): array
    {
        return ['preset' => \App\Support\GradingScale::preset($i), 'rows' => array_map(fn ($r) => ['grade' => $r['grade'], 'min' => $r['min'] ?? null, 'label' => $r['label'] ?? null], \App\Support\GradingScale::rows($i)),
            'incomplete' => \App\Support\GradingScale::incomplete($i)];
    }

    /** bd_gpa: back to the default scale (nothing stored); labelled: the preset's grade codes with the institution's ranges and labels */
    public function setGrading(Institution $i, array $g): void
    {
        $s = $i->settings ?? [];
        unset($s['grading_scale'], $s['grading_preset']);
        if ($g['preset'] === 'labelled') {
            $given = collect($g['rows'] ?? [])->keyBy('grade');
            $rows = [];
            foreach (config('grading_presets.labelled') as $n => $p) {
                $r = $given[$p['grade']] ?? [];
                $min = $p['grade'] === 'F' ? 0 : (isset($r['min']) && $r['min'] !== '' ? round((float) $r['min'], 2) : null);
                $label = [];
                foreach (['bn', 'en', 'ar'] as $l) $label[$l] = trim((string) ($r['label'][$l] ?? '')) ?: $p['label'][$l];
                $rows[] = ['grade' => $p['grade'], 'min' => $min, 'point' => $p['point'], 'label' => $label];
            }
            $mins = array_column($rows, 'min');
            if (!in_array(null, $mins, true)) {
                for ($k = 1; $k < count($mins); $k++) if ($mins[$k] >= $mins[$k - 1]) throw new \App\Exceptions\BusinessException('ranges must go down', 'grading_order', 422);
            }
            $s['grading_scale'] = $rows;
            $s['grading_preset'] = 'labelled';
        }
        $i->forceFill(['settings' => $s])->save();
        app(ThemeService::class)->flush($i);
    }

    /** D197 AAD.3 (academics-advanced.md section 5): up to this many days a class teacher decides a student's leave; above it, the admin */
    public function studentLeave(Institution $i): array
    {
        $l = ($i->settings ?? [])['student_leave'] ?? [];
        return ['max_days_auto' => max(0, (int) ($l['max_days_auto'] ?? 3))];
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

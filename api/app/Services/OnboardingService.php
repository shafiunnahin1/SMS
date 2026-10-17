<?php

namespace App\Services;

use App\Models\{Batch, FeeCategory, Institution, Program};
use App\Support\Tenancy;

// docs/modules/institution-types.md "Onboarding Defaults Per Type". Runs right after signup (Step 5.1); the onboarding
// wizard then lets the admin edit what it created. Fee amounts are not in the spec: they start at 0 for the admin to fill.
class OnboardingService
{
    private const HSC_GROUPS = [
        ['একাদশ - বিজ্ঞান', 11, 'science'], ['একাদশ - মানবিক', 11, 'humanities'], ['একাদশ - ব্যবসায় শিক্ষা', 11, 'business'],
        ['দ্বাদশ - বিজ্ঞান', 12, 'science'], ['দ্বাদশ - মানবিক', 12, 'humanities'], ['দ্বাদশ - ব্যবসায় শিক্ষা', 12, 'business'],
    ];

    public function applyDefaults(Institution $i): void
    {
        $cfg = config("institution_types.{$i->institution_type}.onboarding");

        $i->forceFill(['settings' => array_merge($i->settings ?? [], [
            'public_site' => ['enabled' => (bool) $cfg['public_site'], 'admission_open' => true, 'headline' => $i->name],
            'platform_collect' => true,
        ])])->save();

        Tenancy::as($i, function () use ($cfg) {
            $batches = $cfg['batches'] ?? [];
            match ($cfg['programs']) {
                'class_1_10'      => collect(range(1, 10))->each(fn ($n) => $this->program("Class {$n}", ['numeric_name' => $n], $batches)),
                'hsc_groups'      => collect(self::HSC_GROUPS)->each(fn ($g) => $this->program($g[0], ['numeric_name' => $g[1], 'group_name' => $g[2]], $batches)),
                'default_general' => $this->program('General', ['is_default' => true], []),
                default           => null,                         // 'none': the wizard creates courses and batches
            };

            foreach ($cfg['fee_categories'] ?? [] as $name) {
                FeeCategory::firstOrCreate(['name' => $name], ['amount' => 0, 'frequency' => $this->frequencyOf($name)]);
            }
        });
    }

    private function program(string $name, array $attrs, array $batches): Program
    {
        $program = Program::firstOrCreate(['name' => $name], $attrs);
        foreach ($batches as $b) Batch::firstOrCreate(['program_id' => $program->id, 'name' => $b]);
        return $program;
    }

    /** মাসিক… = monthly, সেশন… = yearly, everything else (ভর্তি, পরীক্ষা, কোর্স ফি) = once */
    private function frequencyOf(string $name): string
    {
        return str_contains($name, 'মাসিক') ? 'monthly' : (str_contains($name, 'সেশন') ? 'yearly' : 'once');
    }
}

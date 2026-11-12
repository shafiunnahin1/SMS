<?php

namespace App\Services\PublicSite;

use App\Models\{Batch, Institution, Notice, Program};
use App\Services\{InstitutionSettings, ModuleGate};
use Illuminate\Support\Facades\{Cache, Storage};
use Illuminate\Support\Str;

// D202 PUB.2 (docs/modules/public-website.md): `institutions.settings.public_site` with its defaults, and the cached payload of
// GET /public/site. The payload is public: the institution's own name, logo, contact and texts, its public+active programs (with
// batch names and schedules for coaching / private_batch only - never fees or seats of a batch) and its public notices.
// Never a student, user, fee or result. Cache `public_site:{institution_id}` 300 s, forgotten on every change that shows here.
class PublicSiteService
{
    public const CONTACT = ['phone', 'email', 'address', 'map_url', 'facebook_url', 'whatsapp'];

    public function settings(Institution $i): array
    {
        $s = ($i->settings ?? [])['public_site'] ?? [];
        $contact = $s['contact'] ?? [];
        return [
            'enabled' => (bool) ($s['enabled'] ?? false),
            'headline' => (string) ($s['headline'] ?? ''), 'tagline' => (string) ($s['tagline'] ?? ''), 'about' => (string) ($s['about'] ?? ''),
            'hero_image_path' => $s['hero_image_path'] ?? null,
            'show_programs' => (bool) ($s['show_programs'] ?? true), 'show_notices' => (bool) ($s['show_notices'] ?? true),
            'admission_open' => (bool) ($s['admission_open'] ?? true), 'admission_message' => (string) ($s['admission_message'] ?? ''),
            'contact' => array_map(fn ($k) => (string) ($contact[$k] ?? ''), array_combine(self::CONTACT, self::CONTACT)),
            'seo' => ['title' => (string) ($s['seo']['title'] ?? ''), 'description' => (string) ($s['seo']['description'] ?? '')],
            'alert_sms' => (bool) ($s['alert_sms'] ?? false),
        ];
    }

    /** the site is shown: module on (the route middleware) and switched on by the institution */
    public function open(Institution $i): bool
    {
        return $this->settings($i)['enabled'] && app(ModuleGate::class)->allows($i, 'public_site');
    }

    public function heroUrl(?string $path): ?string
    {
        return $path ? Storage::disk('public')->url($path) : null;
    }

    public function payload(Institution $i): array
    {
        return Cache::remember(self::key($i->id), 300, function () use ($i) {
            $s = $this->settings($i);
            $withBatches = in_array($i->institution_type, ['coaching', 'private_batch'], true);
            $programs = !$s['show_programs'] ? [] : Program::where('is_public', 1)->where('is_active', 1)->orderBy('sort_order')->orderBy('id')
                ->get(['id', 'name', 'public_description', 'duration_months', 'course_fee'])
                ->map(function ($p) use ($withBatches) {
                    $row = ['id' => $p->id, 'name' => $p->name, 'public_description' => $p->public_description, 'duration_months' => $p->duration_months, 'course_fee' => $p->course_fee];
                    if ($withBatches) $row['batches'] = Batch::where('program_id', $p->id)->whereIn('status', ['upcoming', 'running'])->orderBy('name')
                        ->get(['id', 'name', 'schedule', 'status'])->map(fn ($b) => ['id' => $b->id, 'name' => $b->name, 'schedule' => $b->schedule, 'status' => $b->status])->values()->all();
                    return $row;
                })->values()->all();
            $notices = !$s['show_notices'] ? [] : $this->notices()->limit(5)->get()->map(fn ($n) => $this->notice($n, true))->values()->all();
            return [
                'name' => $i->name, 'institution_type' => $i->institution_type,
                'logo_url' => $i->logo_path ? Storage::disk('public')->url($i->logo_path) : null,
                'settings' => ['headline' => $s['headline'], 'tagline' => $s['tagline'], 'about' => $s['about'], 'hero_url' => $this->heroUrl($s['hero_image_path']),
                    'admission_open' => $s['admission_open'], 'admission_message' => $s['admission_message'], 'contact' => $s['contact'],
                    'show_programs' => $s['show_programs'], 'show_notices' => $s['show_notices']],
                'programs' => $programs, 'notices' => $notices,
            ];
        });
    }

    /** public notices already published, newest first */
    public function notices()
    {
        return Notice::where('is_public', 1)->where('published_at', '<=', now())->orderByDesc('published_at')->orderByDesc('id');
    }

    public function notice(Notice $n, bool $excerpt = false): array
    {
        $row = ['id' => $n->id, 'title' => $n->title, 'excerpt' => Str::limit((string) $n->content, 160), 'published_at' => $n->published_at?->toIso8601String()];
        if (!$excerpt) $row['content'] = $n->content;
        return $row;
    }

    public static function key(int $institutionId): string { return "public_site:{$institutionId}"; }

    public static function forget(?int $institutionId): void
    {
        if ($institutionId) Cache::forget(self::key($institutionId));
    }
}

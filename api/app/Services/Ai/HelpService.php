<?php

namespace App\Services\Ai;

use App\Models\{AiHelpArticle, DepartmentMembership, Institution, User};
use App\Services\{DepartmentDutyPermissionService, DepartmentRoutePermissionResolver, ModuleGate};
use App\Services\QbQuestionFinderService;
use App\Support\Tenancy;
use Illuminate\Support\Facades\Route;

/**
 * D166 (6) AI-Q4: the software help guide. It answers only from APPROVED help articles - the platform's (institution NULL) or the
 * caller's institution's own wording of one (which then replaces the platform article there) - that fit the caller: their role,
 * their institution's type, a module that is on, their language (else Bangla). An article whose routes no longer exist is skipped
 * (fail closed: a stale guide is never shown). It never runs an action and asks for no secret; a help answer names its article
 * as a "help" source, apart from question-bank sources, and is not counted against free answers.
 */
final class HelpService
{
    /** words that ask about the software ("how do I", "where", "add", ...) - with one of them a question may be about a workflow */
    private const INTENT = ['কীভাবে', 'কিভাবে', 'কোথায়', 'কোথা', 'কেমনে', 'করব', 'করবো', 'করতে', 'যোগ', 'তৈরি', 'খুলব', 'দেখব', 'দেখতে', 'দিব', 'দেব', 'কিনব', 'নেব', 'নিতে',
        'how', 'where', 'add', 'create', 'open', 'find', 'enter', 'setup', 'set', 'buy', 'see', 'make'];

    /** roles that also get question-bank answers; the rest (parent, accountant, ...) get the help guide only */
    public const EDU_ROLES = ['admin', 'teacher', 'student'];

    public function __construct(private ModuleGate $gate, private DepartmentDutyPermissionService $duties) {}

    public static function intent(string $norm): bool
    {
        foreach (explode(' ', $norm) as $w) {
            foreach (self::INTENT as $i) if ($w === $i || (mb_strlen($i) >= 3 && str_starts_with($w, $i))) return true;
        }
        return false;
    }

    /** the best fitting approved article for this caller, or null */
    public function find(User $user, string $norm, ?string $locale = null): ?AiHelpArticle
    {
        if ($norm === '') return null;
        $locale = in_array($locale ?? app()->getLocale(), ['bn', 'en'], true) ? ($locale ?? app()->getLocale()) : 'bn';
        $inst = Tenancy::current();
        $rows = AiHelpArticle::anyInstitution()->where('status', 'approved')
            ->where(fn ($q) => $q->whereNull('institution_id')->when($inst, fn ($w) => $w->orWhere('institution_id', $inst->id)))
            ->whereIn('locale', array_unique([$locale, 'bn']))->get();
        $replaced = $rows->whereNotNull('institution_id')->pluck('base_article_id')->filter()->all();
        $terms = RelevanceService::terms($norm);
        $best = $rows->reject(fn ($a) => $a->institution_id === null && in_array($a->id, $replaced, true))
            ->filter(fn ($a) => $this->fits($a, $user, $inst))
            ->map(fn ($a) => ['a' => $a, 'cov' => RelevanceService::coverage($terms, QbQuestionFinderService::normalize($a->title . ' ' . $a->keywords)),
                'own' => $a->locale === $locale ? 1 : 0])
            ->filter(fn ($r) => $r['cov'] >= 0.5)
            ->sortByDesc(fn ($r) => [$r['cov'], $r['own']])->first();
        return $best['a'] ?? null;
    }

    /** the caller's role, institution type and modules - and every route it names still exists */
    private function fits(AiHelpArticle $a, User $user, ?Institution $inst): bool
    {
        if (!in_array($user->role, $a->roles ?? [], true)) return false;
        if ($inst && $a->module && !$this->gate->allows($inst, $a->module)) return false;
        if ($inst && $a->institution_types && !in_array($inst->institution_type, $a->institution_types, true)) return false;
        if (!self::routesExist($a->refs['routes'] ?? [])) return false;
        return $user->role !== 'institution_staff' || $this->staffMayUse($user, $a->refs['routes'] ?? []);
    }

    /**
     * D168 (2): a staff member sees an article only if EVERY route it names is catalogued exact_duty_permission and they hold that
     * permission in ANY of their active departments (DepartmentDutyPermissionService - active membership and duty). No route, a
     * principal-only / non-staff / uncatalogued route: hidden (fail closed). This decides only which help text is shown; the pages
     * themselves still enforce D90/D91 for the selected department.
     */
    private function staffMayUse(User $user, array $routes): bool
    {
        if ($routes === []) return false;
        $catalog = DepartmentRoutePermissionResolver::entries();
        $departments = null;
        foreach ($routes as $ref) {
            [$method, $uri] = array_pad(explode(' ', $ref, 2), 2, '');
            $entry = collect($catalog)->first(fn ($e) => $e['uri'] === $uri && in_array($method, explode('|', $e['method']), true));
            if (!$entry || $entry['staff_mode'] !== 'exact_duty_permission' || count($entry['permission_options']) !== 1) return false;
            $departments ??= DepartmentMembership::where('user_id', $user->id)->where('status', 'active')->pluck('department_id')->unique()->all();
            $permission = $entry['permission_options'][0];
            if (!collect($departments)->contains(fn ($d) => $this->duties->has($user, (int) $d, $permission))) return false;
        }
        return true;
    }

    /** "METHOD api/v1/uri" entries all exist in the live route table */
    public static function routesExist(array $refs): bool
    {
        $live = [];
        foreach (Route::getRoutes()->getRoutes() as $r) foreach ($r->methods() as $m) $live["{$m} {$r->uri()}"] = true;
        foreach ($refs as $ref) if (!isset($live[$ref])) return false;
        return true;
    }

    /** the fixed answer layout: purpose, where to go, steps, data, the result, errors and fixes, the role / module limits */
    public static function render(AiHelpArticle $a): string
    {
        $b = $a->body ?? [];
        $h = fn (string $k) => __("ai.help.{$k}", [], $a->locale);
        $out = ["{$a->title}", '', $h('purpose') . ': ' . ($b['purpose'] ?? ''), $h('where') . ': ' . ($b['where'] ?? ''), '', $h('steps') . ':'];
        foreach (array_values($b['steps'] ?? []) as $i => $s) $out[] = ($i + 1) . '. ' . $s;
        if (!empty($b['data'])) { $out[] = ''; $out[] = $h('data') . ':'; foreach ($b['data'] as $d) $out[] = '• ' . $d; }
        $out[] = ''; $out[] = $h('result') . ': ' . ($b['result'] ?? '');
        if (!empty($b['errors'])) { $out[] = ''; $out[] = $h('errors') . ':'; foreach ($b['errors'] as $e) $out[] = '• ' . $e; }
        $out[] = ''; $out[] = $h('limits') . ': ' . ($b['limits'] ?? '');
        return implode("\n", $out);
    }
}

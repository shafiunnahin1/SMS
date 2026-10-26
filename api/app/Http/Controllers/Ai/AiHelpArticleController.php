<?php

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Models\{AiHelpArticle, AuditLog};
use App\Services\Ai\HelpService;
use Illuminate\Http\Request;

/**
 * D166 (6) AI-Q4 part 2: approving the help guide. The Super Admin panel (central host) writes, edits and approves the PLATFORM
 * articles (institution NULL); an institution's admin panel writes, edits and approves its OWN wording of an approved platform
 * article, shown only in that institution instead of the platform's. Roles, module and routes always come from the platform
 * article (an institution cannot widen who sees it). Any edit returns the article to draft - nothing unapproved is shown - and
 * every write and approval is audited. Super Admin's own help questions are answered here too (no chat is stored).
 */
class AiHelpArticleController extends Controller
{
    private const TEXT = ['title' => 'required|string|max:200', 'keywords' => 'nullable|string|max:500', 'body' => 'required|array',
        'body.purpose' => 'required|string|max:1000', 'body.where' => 'required|string|max:500', 'body.steps' => 'required|array|min:1|max:20',
        'body.steps.*' => 'required|string|max:500', 'body.data' => 'nullable|array|max:20', 'body.data.*' => 'string|max:300',
        'body.result' => 'required|string|max:500', 'body.errors' => 'nullable|array|max:20', 'body.errors.*' => 'string|max:500',
        'body.limits' => 'required|string|max:500'];

    // ── Super Admin panel: the platform's articles ──

    public function superIndex()
    {
        $rows = AiHelpArticle::anyInstitution()->whereNull('institution_id')->orderBy('slug')->orderBy('locale')->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($a) => self::row($a))]);
    }

    public function superStore(Request $request)
    {
        $f = $request->validate(self::TEXT + ['slug' => 'required|string|max:100|regex:/^[a-z0-9-]+$/', 'locale' => 'required|in:bn,en',
            'roles' => 'required|array|min:1', 'roles.*' => 'in:super_admin,admin,teacher,student,parent,accountant,institution_staff',
            'module' => 'nullable|string|max:60', 'routes' => 'nullable|array', 'routes.*' => 'string|max:200']);
        if (AiHelpArticle::anyInstitution()->whereNull('institution_id')->where('slug', $f['slug'])->where('locale', $f['locale'])->exists()) {
            return response()->json(['success' => false, 'message' => __('ai.help.slug_taken')], 422);
        }
        if (!HelpService::routesExist($f['routes'] ?? [])) return response()->json(['success' => false, 'message' => __('ai.help.route_missing')], 422);
        $a = AiHelpArticle::create(['institution_id' => null, 'slug' => $f['slug'], 'locale' => $f['locale'],
            'roles' => array_values($f['roles']), 'module' => $f['module'] ?? null, 'refs' => ['routes' => array_values($f['routes'] ?? [])],
            'status' => 'draft', 'created_by' => $request->user()->id] + self::text($f));
        AuditLog::record('ai.help.created', $request->user(), ['article' => $a->id]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($a)], 201);
    }

    public function superUpdate(Request $request, int $id)
    {
        $a = AiHelpArticle::anyInstitution()->whereNull('institution_id')->findOrFail($id);
        $a->update(self::text($request->validate(self::TEXT)) + self::draft());
        AuditLog::record('ai.help.edited', $request->user(), ['article' => $a->id]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($a->fresh())]);
    }

    public function superApprove(Request $request, int $id)
    {
        $a = AiHelpArticle::anyInstitution()->whereNull('institution_id')->findOrFail($id);
        if (!HelpService::routesExist($a->refs['routes'] ?? [])) return response()->json(['success' => false, 'message' => __('ai.help.route_missing')], 422);
        $a->update(['status' => 'approved', 'approved_by' => $request->user()->id, 'approved_at' => now()]);
        AuditLog::record('ai.help.approved', $request->user(), ['article' => $a->id]);
        return response()->json(['success' => true, 'message' => __('ai.help.approved_msg'), 'data' => self::row($a->fresh())]);
    }

    /** the Super Admin panel's own help question: the best approved article for a super admin, or not found */
    public function superAsk(Request $request, HelpService $help)
    {
        $text = $request->validate(['text' => 'required|string|max:1000'])['text'];
        $a = $help->find($request->user(), \App\Services\QbQuestionFinderService::normalize($text));
        return response()->json(['success' => true, 'data' => $a
            ? ['kind' => 'help', 'body' => HelpService::render($a), 'sources' => [['type' => 'help', 'id' => $a->id, 'title' => $a->title]]]
            : ['kind' => 'not_found', 'body' => __('ai.help.not_found'), 'sources' => []]]);
    }

    // ── an institution's admin panel: its own wording ──

    /** the approved platform articles of this institution's roles, each with this institution's own wording if any */
    public function index()
    {
        $own = AiHelpArticle::all()->keyBy('base_article_id');
        $base = AiHelpArticle::anyInstitution()->whereNull('institution_id')->where('status', 'approved')->orderBy('slug')->orderBy('locale')->get()
            ->filter(fn ($a) => array_diff($a->roles ?? [], ['super_admin']) !== []);
        return response()->json(['success' => true, 'data' => $base->values()->map(fn ($a) => self::row($a) + ['own' => isset($own[$a->id]) ? self::row($own[$a->id]) : null])]);
    }

    public function store(Request $request)
    {
        $f = $request->validate(self::TEXT + ['base_article_id' => 'required|integer']);
        $base = AiHelpArticle::anyInstitution()->whereNull('institution_id')->where('status', 'approved')->findOrFail($f['base_article_id']);
        if (AiHelpArticle::where('base_article_id', $base->id)->exists()) return response()->json(['success' => false, 'message' => __('ai.help.slug_taken')], 422);
        $a = AiHelpArticle::create(['base_article_id' => $base->id, 'slug' => $base->slug, 'locale' => $base->locale, 'roles' => $base->roles,
            'module' => $base->module, 'institution_types' => $base->institution_types, 'refs' => $base->refs, 'status' => 'draft',
            'created_by' => $request->user()->id] + self::text($f));
        AuditLog::record('ai.help.created', $a, ['article' => $a->id]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($a)], 201);
    }

    public function update(Request $request, int $id)
    {
        $a = AiHelpArticle::findOrFail($id);
        $a->update(self::text($request->validate(self::TEXT)) + self::draft());
        AuditLog::record('ai.help.edited', $a, ['article' => $a->id]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($a->fresh())]);
    }

    public function approve(Request $request, int $id)
    {
        $a = AiHelpArticle::findOrFail($id);
        $a->update(['status' => 'approved', 'approved_by' => $request->user()->id, 'approved_at' => now()]);
        AuditLog::record('ai.help.approved', $a, ['article' => $a->id]);
        return response()->json(['success' => true, 'message' => __('ai.help.approved_msg'), 'data' => self::row($a->fresh())]);
    }

    private static function text(array $f): array
    {
        return ['title' => $f['title'], 'keywords' => $f['keywords'] ?? '', 'body' => array_intersect_key($f['body'], array_flip(['purpose', 'where', 'steps', 'data', 'result', 'errors', 'limits']))];
    }

    private static function draft(): array
    {
        return ['status' => 'draft', 'approved_by' => null, 'approved_at' => null];
    }

    private static function row(AiHelpArticle $a): array
    {
        return ['id' => $a->id, 'slug' => $a->slug, 'locale' => $a->locale, 'title' => $a->title, 'keywords' => $a->keywords, 'roles' => $a->roles ?? [],
            'module' => $a->module, 'body' => $a->body ?? [], 'status' => $a->status, 'approved_at' => $a->approved_at?->toIso8601String(),
            'live' => HelpService::routesExist($a->refs['routes'] ?? []), 'preview' => HelpService::render($a)];
    }
}

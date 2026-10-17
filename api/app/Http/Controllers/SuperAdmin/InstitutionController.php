<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Http\Requests\SuperAdmin\{StoreInstitutionRequest, UpdateInstitutionRequest};
use App\Models\{AuditLog, Institution, SmsCreditTransaction, Student, Teacher, User};
use App\Services\{ModuleGate, ThemeService};
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// Step 5.3 (D55, owner 2026-10-10): the Super Admin opens institutions (no plans, no trial clock), edits them, overrides
// modules, suspends / activates. Runs on the central host under `tenancy.bypass`; every write to tenant data is done inside
// Tenancy::as(). An institution is never hard-deleted here (D32 money rows; the purge flow is a later release).
class InstitutionController extends Controller
{
    private const TYPES = ['school', 'college', 'coaching', 'private_batch'];

    public function __construct(private ModuleGate $gate) {}

    /** GET /super/institutions?q=&status=&type= */
    public function index(Request $request)
    {
        $f = $request->validate(['q' => 'nullable|string|max:100', 'status' => 'nullable|in:trial,active,expired,suspended,inactive',
            'type' => 'nullable|in:' . implode(',', self::TYPES), 'per_page' => 'nullable|integer|min:1|max:100']);
        $page = Institution::query()
            ->when($f['q'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w->where('name', 'like', "%{$s}%")->orWhere('slug', 'like', "%{$s}%")))
            ->when($f['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($f['type'] ?? null, fn ($q, $t) => $q->where('institution_type', $t))
            ->orderByDesc('id')->paginate($f['per_page'] ?? 25);
        $ids = collect($page->items())->pluck('id');
        $students = Student::whereIn('institution_id', $ids)->where('status', 'active')->selectRaw('institution_id, COUNT(*) AS n')->groupBy('institution_id')->pluck('n', 'institution_id');
        $teachers = Teacher::whereIn('institution_id', $ids)->selectRaw('institution_id, COUNT(*) AS n')->groupBy('institution_id')->pluck('n', 'institution_id');
        return response()->json(['success' => true,
            'data' => collect($page->items())->map(fn ($i) => $this->row($i) + ['students' => (int) ($students[$i->id] ?? 0), 'teachers' => (int) ($teachers[$i->id] ?? 0)])->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'per_page' => $page->perPage()]]);
    }

    /** D90: approved review, pending recipient verification/password setup. */
    public function store(StoreInstitutionRequest $request, \App\Services\Auth\PrincipalProvisioningService $provisioning)
    {
        $in = $request->validated();
        $state = $provisioning->provision(collect($in)->except('admin')->all(), $in['admin'], $request->user());
        $i = Institution::findOrFail($state['institution_id']);
        return response()->json(['success' => true, 'data' => $this->detail($i) + [
            'activation' => new \App\Http\Resources\PrincipalActivationResource($state)], 'message' => __('messages.saved')], 201);
    }

    /** GET /super/institutions/{id} */
    public function show(int $id)
    {
        return response()->json(['success' => true, 'data' => $this->detail(Institution::findOrFail($id))]);
    }

    /** PUT /super/institutions/{id}: profile, type and module overrides - the tenant's menu follows at once (cache dropped) */
    public function update(UpdateInstitutionRequest $request, int $id)
    {
        $i = Institution::findOrFail($id);
        $in = $request->validated();
        $changes = collect($in)->except('modules')->all();
        if (array_key_exists('modules', $in)) {
            $overrides = $i->enabled_modules ?? [];
            foreach ($in['modules'] as $m => $v) {
                if ($v === null) unset($overrides[$m]); else $overrides[$m] = (bool) $v;
            }
            $changes['enabled_modules'] = $overrides ?: null;
        }
        $i->forceFill($changes)->save();
        AuditLog::record('institution.updated', $i, collect($changes)->only(['institution_type', 'enabled_modules'])->all() + ['fields' => array_keys($changes)]);
        app(ThemeService::class)->flush($i);           // drops theme:{id} and bootstrap:{id} - the modules list is rebuilt on the next request
        return response()->json(['success' => true, 'data' => $this->detail($i->fresh()), 'message' => __('messages.saved')]);
    }

    /** PATCH /super/institutions/{id}/toggle: suspended <-> active */
    public function toggleStatus(int $id)
    {
        $i = DB::transaction(function () use ($id) {
            $i = Institution::whereKey($id)->lockForUpdate()->firstOrFail();
            app(\App\Services\Auth\PrincipalProvisioningService::class)->assertToggleAllowed($id);
            $i->forceFill(['status' => $i->status === 'suspended' ? 'active' : 'suspended'])->save();
            AuditLog::record($i->status === 'suspended' ? 'institution.suspended' : 'institution.activated', $i);
            return $i;
        });
        app(ThemeService::class)->flush($i);
        return response()->json(['success' => true, 'data' => $this->detail($i->fresh()), 'message' => __('messages.saved')]);
    }

    /** DELETE /super/institutions/{id}: refused - suspend instead. Money rows are never deleted (D32); purging a tenant is a later release. */
    public function destroy(int $id)
    {
        Institution::findOrFail($id);
        throw new BusinessException('institutions are suspended, not deleted', 'institution_delete_refused', 409);
    }

    private function row(Institution $i): array
    {
        return ['id' => $i->id, 'name' => $i->name, 'slug' => $i->slug, 'host' => $i->slug . '.' . config('tenancy.base_domain'),
            'institution_type' => $i->institution_type, 'status' => $i->status, 'sms_balance' => $i->sms_balance,
            'created_at' => $i->created_at ? \Illuminate\Support\Carbon::parse($i->created_at)->toIso8601String() : null];
    }

    private function detail(Institution $i): array
    {
        $overrides = $i->enabled_modules ?? [];
        $typeModules = config("institution_types.{$i->institution_type}.modules", []);
        return Tenancy::as($i, fn () => $this->row($i) + [
            'phone' => $i->phone, 'email' => $i->email, 'address' => $i->address,
            'students' => Student::where('status', 'active')->count(), 'teachers' => Teacher::count(),
            'admins' => User::where('institution_id', $i->id)->where('role', 'admin')->orderBy('id')->get(['id', 'name', 'phone', 'email', 'last_login_at'])
                ->map(fn ($u) => ['id' => $u->id, 'name' => $u->name, 'phone' => $u->phone, 'email' => $u->email, 'last_login_at' => $u->last_login_at?->toIso8601String()]),
            'modules' => collect(config('release.modules'))->map(fn ($m) => ['key' => $m, 'in_type' => in_array($m, $typeModules, true),
                'override' => array_key_exists($m, $overrides) ? (bool) $overrides[$m] : null, 'enabled' => $this->gate->allows($i, $m)])->values(),
            'sms' => ['balance' => $i->sms_balance, 'universal_enabled' => (bool) $i->sms_universal_enabled, 'own_enabled' => (bool) $i->sms_own_enabled,
                'transactions' => SmsCreditTransaction::orderByDesc('id')->limit(20)->get()->map(fn ($t) => ['id' => $t->id, 'type' => $t->type, 'amount' => $t->amount,
                    'balance_after' => $t->balance_after, 'reference' => $t->reference, 'created_at' => $t->created_at?->toIso8601String()])],
        ]);
    }
}

<?php

namespace App\Services\Migration;

use App\Models\{AuditLog, User};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * R2.1.1 / D111 (1)(2)(5): turns a qbank identity export into a plan. Input (JSON, one key per qbank table):
 *   users[{id,name,email,email_verified_at,role,is_active}], institutions[{id,name_bn,name_en,slug,institution_type,is_active}],
 *   institution_members[{institution_id,user_id,role,status}], institution_students[{institution_id,name,roll_no,guardian_phone,is_active}]
 * D112: a plain qbank user is planned as the admin of their own private batch (created only through D90 provisioning).
 * Nothing is merged on a guess: a duplicate or unverified email, an email already used here, a qbank super-admin, or a user who is
 * both a school member and a platform role goes to the review list. apply() creates ONLY the platform writer/moderator accounts of the
 * plan (random password, must_change_password: they set their own through the normal reset); schools are never created here - each
 * planned school goes through Super Admin provisioning and approval (D90), with its admin/teachers/students listed for that step.
 */
class QbankIdentityPlanner
{
    // D112: qbank teacher writes questions; admin/moderator review; a plain qbank "user" becomes the admin of their own private batch (D90 provisioning)
    public const PLATFORM_ROLE = ['teacher' => 'content_writer', 'moderator' => 'content_moderator', 'admin' => 'content_moderator'];
    public const MEMBER_ROLE = ['owner' => 'admin', 'member' => 'teacher', 'teacher' => 'teacher'];

    public function plan(array $export): array
    {
        $users = collect($export['users'] ?? []);
        $members = collect($export['institution_members'] ?? [])->where('status', '!=', 'removed');
        $students = collect($export['institution_students'] ?? []);
        $review = []; $platform = []; $schools = []; $batches = [];
        $norm = fn ($e) => mb_strtolower(trim((string) $e));
        $dupes = $users->groupBy(fn ($u) => $norm($u['email'] ?? ''))->filter(fn ($g, $e) => $e !== '' && $g->count() > 1)->keys()->all();
        $taken = User::platform()->whereIn(DB::raw('LOWER(email)'), $users->map(fn ($u) => $norm($u['email'] ?? ''))->filter()->unique()->values())->pluck('email')->map($norm)->all();
        $memberOf = $members->groupBy('user_id');
        $ok = [];
        foreach ($users as $u) {
            $email = $norm($u['email'] ?? ''); $id = $u['id'] ?? null; $role = $u['role'] ?? 'user';
            $why = match (true) {
                $email === '' => 'no email',
                in_array($email, $dupes, true) => 'two qbank accounts share this email',
                empty($u['email_verified_at']) => 'email not verified in qbank',
                in_array($email, $taken, true) => 'email already used by a School Management platform account',
                $role === 'super-admin' => 'qbank super-admin is never created automatically',
                !in_array($role, ['user', 'teacher', 'moderator', 'admin'], true) => "unknown qbank role {$role}",
                $memberOf->has($id) && in_array($role, ['moderator', 'admin'], true) => 'both a school member and a platform moderator',
                default => null,
            };
            if ($why) { $review[] = ['qbank_user_id' => $id, 'email' => $email, 'role' => $role, 'reason' => $why]; continue; }
            $ok[$id] = $u + ['email_norm' => $email];
            if ($role === 'user') {
                if (!$memberOf->has($id)) $batches[] = ['qbank_user_id' => $id, 'name' => $u['name'] ?? $email, 'email' => $email, 'role' => 'admin',
                    'institution_type' => 'private_batch', 'next_step' => 'Super Admin provisioning and approval (D90)'];
            } elseif (isset(self::PLATFORM_ROLE[$role]) && !$memberOf->has($id)) {   // a school's teacher keeps only what the school grants (D112)
                $platform[] = ['qbank_user_id' => $id, 'name' => $u['name'] ?? $email, 'email' => $email, 'role' => self::PLATFORM_ROLE[$role], 'active' => (bool) ($u['is_active'] ?? true)];
            }
        }
        foreach ($export['institutions'] ?? [] as $inst) {
            $rows = $members->where('institution_id', $inst['id']);
            $people = $rows->filter(fn ($m) => isset($ok[$m['user_id']]))->map(fn ($m) => ['qbank_user_id' => $m['user_id'], 'email' => $ok[$m['user_id']]['email_norm'],
                'role' => self::MEMBER_ROLE[$m['role'] ?? 'member'] ?? 'teacher'])->values();
            $admins = $people->where('role', 'admin')->values();
            if ($admins->count() !== 1) $review[] = ['qbank_institution_id' => $inst['id'], 'name' => $inst['name_bn'] ?? $inst['name_en'] ?? '', 'reason' => $admins->isEmpty() ? 'school has no reviewable owner' : 'school has more than one owner'];
            $schools[] = ['qbank_institution_id' => $inst['id'], 'name' => $inst['name_bn'] ?? $inst['name_en'] ?? '', 'slug' => $inst['slug'] ?? null,
                'type' => $inst['institution_type'] ?? null, 'admin' => $admins->first(), 'teachers' => $people->where('role', 'teacher')->values()->all(),
                'students' => $students->where('institution_id', $inst['id'])->where('is_active', '!=', false)->count(), 'next_step' => 'Super Admin provisioning and approval (D90)'];
        }
        return ['summary' => ['qbank_users' => $users->count(), 'platform_accounts' => count($platform), 'private_batches' => count($batches), 'schools' => count($schools), 'review' => count($review)],
            'platform_accounts' => $platform, 'private_batches' => $batches, 'schools' => $schools, 'review' => $review];
    }

    /** creates the plan's platform accounts only; idempotent (an email that now exists is skipped) */
    public function apply(array $plan): array
    {
        $made = 0; $skipped = 0;
        DB::transaction(function () use ($plan, &$made, &$skipped) {
            foreach ($plan['platform_accounts'] as $p) {
                if (User::platform()->whereRaw('LOWER(email) = ?', [$p['email']])->exists()) { $skipped++; continue; }
                $u = User::create(['institution_id' => null, 'name' => $p['name'], 'email' => $p['email'], 'role' => $p['role'],
                    'password' => Str::password(40), 'is_active' => $p['active'], 'must_change_password' => true]);
                AuditLog::record('migration.qbank.platform_account', $u, ['qbank_user_id' => $p['qbank_user_id'], 'role' => $p['role']]);
                $made++;
            }
        });
        return ['created' => $made, 'skipped' => $skipped];
    }
}

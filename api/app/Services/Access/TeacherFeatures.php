<?php

namespace App\Services\Access;

use App\Models\{Institution, TeacherFeatureOverride, User};
use Illuminate\Http\Request;

// D205 PERM.1: the fixed list of teacher features the admin may switch off - for every teacher (institutions.settings
// .teacher_features_off) and, as exceptions, for one teacher (teacher_feature_overrides). Each feature is a set of existing teacher
// routes ("METHOD uri" after api/v1/, or a uri prefix ending in '/'); a switched-off feature answers 403 `feature_off` on them for
// that teacher. Dashboard, own batches, routine, profile, password and notifications are never switchable. A switch only takes
// away: the module gate and the role rules still decide first.
class TeacherFeatures
{
    public const FEATURES = [
        'attendance' => ['GET attendance', 'POST attendance', 'PUT attendance/{id}', 'GET attendance/report', 'GET attendance/summary/{id}',
            'GET batches/{id}/attendance-grants', 'POST batches/{id}/attendance-grants', 'DELETE attendance-grants/{id}'],
        'period_attendance' => ['POST period-attendance', 'GET period-attendance/report', 'GET teacher/periods/today'],
        'marks' => ['GET exams/{id}/subjects/{subjectId}/entry', 'POST exams/{id}/subjects/{subjectId}/mcq-import', 'POST exams/{id}/subjects/{subjectId}/submission',
            'GET results', 'POST results/bulk', 'GET results/marksheet/{studentId}', 'PUT results/{id}', 'GET result-sheets/{id}/preview'],
        'question_bank' => ['* question-bank/'],
        'ai_assistant' => ['* ai/'],
        'student_leave' => ['GET leave-requests/students', 'PATCH leave-requests/students/{id}'],
        'substitution' => ['GET teacher/substitution-offers', '* hr/leaves/{leave}/substitution-slots'],
        'referrals' => ['GET referrals', 'POST referrals'],
        'salary' => ['* teacher/salary', 'GET hr/people/{type}/{id}/salary'],
        'own_leave' => ['GET teacher/leave', 'POST teacher/leave', 'PATCH hr/leaves/{id}/{action}'],
        'notices' => ['GET notices', 'GET notices/{id}', 'POST notices/{id}/ack'],
    ];

    public static function keys(): array { return array_keys(self::FEATURES); }

    /** the feature a request belongs to, or null (never switchable) */
    public function forRequest(Request $request): ?string
    {
        $route = $request->route();
        if (!$route) return null;
        $method = $request->method() === 'HEAD' ? 'GET' : $request->method();
        $uri = preg_replace('#^api/v1/#', '', $route->uri());
        foreach (self::FEATURES as $key => $patterns) {
            foreach ($patterns as $p) {
                [$m, $u] = explode(' ', $p, 2);
                if ($m === '*' ? ($uri === rtrim($u, '/') || str_starts_with($uri, rtrim($u, '/') . '/')) : ($m === $method && $u === $uri)) return $key;
            }
        }
        return null;
    }

    /** the institution's default: features switched off for every teacher */
    public function institutionOff(Institution $i): array
    {
        return array_values(array_intersect(self::keys(), (array) (($i->settings ?? [])['teacher_features_off'] ?? [])));
    }

    /** one teacher's exceptions: feature => blocked|allowed */
    public function overrides(User $u): array
    {
        return TeacherFeatureOverride::where('user_id', $u->id)->pluck('state', 'feature_key')->only(self::keys())->all();
    }

    /** the features switched off for this teacher, after the exceptions */
    public function offFor(User $u, Institution $i): array
    {
        $off = array_flip($this->institutionOff($i));
        foreach ($this->overrides($u) as $key => $state) {
            if ($state === 'blocked') $off[$key] = true; else unset($off[$key]);
        }
        return array_values(array_intersect(self::keys(), array_keys($off)));
    }
}

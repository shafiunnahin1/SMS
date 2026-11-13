<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, TeacherFeatureOverride, User};
use App\Services\Access\TeacherFeatures;
use App\Services\InstitutionSettings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

// D205 PERM.1: the teacher feature switches. The admin switches features off for every teacher of the institution and, as
// exceptions, off or back on for one teacher; a teacher reads their own effective list (the menu and buttons follow it). Every
// change is audited with ids and keys only.
class TeacherFeatureController extends Controller
{
    public function __construct(private TeacherFeatures $features) {}

    /** GET /admin/teacher-features */
    public function institution()
    {
        return response()->json(['success' => true, 'data' => ['features' => TeacherFeatures::keys(), 'off' => $this->features->institutionOff(app('currentInstitution'))]]);
    }

    /** PUT /admin/teacher-features { off: [...] } */
    public function updateInstitution(Request $request, InstitutionSettings $settings)
    {
        $v = $request->validate(['off' => 'present|array', 'off.*' => ['string', 'distinct', Rule::in(TeacherFeatures::keys())]]);
        $i = app('currentInstitution');
        $old = $this->features->institutionOff($i);
        $new = array_values(array_intersect(TeacherFeatures::keys(), $v['off']));
        $settings->merge($i, ['teacher_features_off' => $new]);
        if ($old !== $new) AuditLog::record('teacher_features.institution', $i, ['from' => $old, 'to' => $new]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['features' => TeacherFeatures::keys(), 'off' => $new]]);
    }

    /** GET /admin/users/{id}/teacher-features - one teacher: the institution default, their exceptions and the effective list */
    public function user(int $id)
    {
        return response()->json(['success' => true, 'data' => $this->view($this->teacher($id))]);
    }

    /** PUT /admin/users/{id}/teacher-features { overrides: { key: blocked|allowed|null } } - null removes the exception */
    public function updateUser(Request $request, int $id)
    {
        $u = $this->teacher($id);
        $v = $request->validate(['overrides' => 'present|array', 'overrides.*' => ['nullable', Rule::in(['blocked', 'allowed'])]]);
        $unknown = array_diff(array_keys($v['overrides']), TeacherFeatures::keys());
        if ($unknown) throw \Illuminate\Validation\ValidationException::withMessages(['overrides' => __('validation.in', ['attribute' => 'overrides'])]);
        $before = $this->features->overrides($u);
        DB::transaction(function () use ($u, $v, $request) {
            foreach ($v['overrides'] as $key => $state) {
                if ($state === null) TeacherFeatureOverride::where('user_id', $u->id)->where('feature_key', $key)->delete();
                else TeacherFeatureOverride::updateOrCreate(['user_id' => $u->id, 'feature_key' => $key], ['state' => $state, 'set_by' => $request->user()->id]);
            }
        });
        $after = $this->features->overrides($u);
        if ($before != $after) AuditLog::record('teacher_features.user', $u, ['from' => $before, 'to' => $after]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->view($u)]);
    }

    /** GET /teacher/features - the signed-in teacher's own effective list */
    public function mine(Request $request)
    {
        return response()->json(['success' => true, 'data' => ['off' => $this->features->offFor($request->user(), app('currentInstitution'))]]);
    }

    private function teacher(int $id): User
    {
        return User::inTenant()->where('role', 'teacher')->findOrFail($id);
    }

    private function view(User $u): array
    {
        $i = app('currentInstitution');
        return ['user_id' => $u->id, 'name' => $u->name, 'features' => TeacherFeatures::keys(), 'institution_off' => $this->features->institutionOff($i),
            'overrides' => (object) $this->features->overrides($u), 'off' => $this->features->offFor($u, $i)];
    }
}

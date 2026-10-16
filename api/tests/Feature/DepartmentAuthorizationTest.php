<?php

namespace Tests\Feature;

use App\Models\{DepartmentDuty, DepartmentDutyAssignment, StaffMember, Teacher};
use App\Services\{DepartmentDutyPermissionService, DepartmentService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DepartmentAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private function fixture(string $slug = 'duty-auth', string $type = 'school'): array
    {
        $i = $this->makeInstitution($slug, $type); $admin = $this->makeUser($i, 'admin'); $user = $this->makeUser($i, 'institution_staff');
        return Tenancy::as($i, function () use ($i, $admin, $user) {
            $s = app(DepartmentService::class);
            $department = $s->create($admin, ['name' => 'Office']);
            $membership = $s->addMember($admin, $department->id, ['user_id' => $user->id]);
            $duty = $s->createDuty($admin, $department->id, ['code' => 'READ', 'name' => 'Read', 'permission_keys' => ['staff.report.dues']]);
            $s->assignDuties($admin, $membership->id, ['duty_ids' => [$duty->id]]);
            return compact('i', 'admin', 'user', 'department', 'membership', 'duty');
        });
    }


    private function staffSubjectHttp(array $a, $h = null, array $query = [], string $method = 'GET', ?string $token = null): \Illuminate\Testing\TestResponse
    {
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer '.($token ?? $a['user']->createToken('subject-read')->plainTextToken)];
        if ($h !== null) $headers['X-Department-Id'] = $h;
        return $this->json($method, 'http://'.$this->hostOf($a['i']).'/api/v1/subjects'.($query ? '?'.http_build_query($query) : ''), [], $headers);
    }

    public function test_staff_subject_index_exact_minimal_sources_and_filters_across_four_types(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            $a = $this->academicFixture('subject-'.$type, $type); $b = $this->academicFixture('subject-foreign-'.$type, $type); $h = (string) $a['department']->id;
            $this->staffSubjectHttp($a, $h)->assertForbidden();
            $subject = Tenancy::as($a['i'], function () use ($a) {
                $a['duty']->update(['permission_keys' => ['staff.subject.index']]);
                $subject = \App\Models\Subject::findOrFail($a['assignment']->subject_id);
                $subject->update(['teacher_id' => $a['teacher']->id]);
                \App\Models\BatchTeacher::create(['batch_id' => $a['classBatch']->id, 'teacher_id' => $a['teacher']->id, 'subject_id' => $subject->id]);
                foreach (['Direct only', 'Zero only', 'TeacherSubject only', 'Class only'] as $name) {
                    $s = \App\Models\Subject::create(['program_id' => $a['program']->id, 'name' => $name, 'teacher_id' => $name === 'Direct only' ? $a['teacher']->id : null]);
                    if ($name === 'TeacherSubject only') \App\Models\TeacherSubject::create(['teacher_id' => $a['teacher']->id, 'subject_id' => $s->id, 'program_id' => $a['program']->id]);
                }
                \App\Models\BatchTeacher::create(['batch_id' => $a['subjectBatch']->id, 'teacher_id' => $a['teacher']->id, 'subject_id' => 0]);
                return $subject;
            });
            $expected = ['success' => true, 'data' => [['id' => $subject->id, 'name' => 'Math', 'program' => ['id' => $a['program']->id, 'name' => 'Own program']]]];
            $this->staffSubjectHttp($a, $h, ['teacher_id' => $b['teacher']->id, 'department_id' => $b['department']->id])->assertOk()->assertExactJson($expected);
            $this->staffSubjectHttp($a, $h, method: 'HEAD')->assertOk();
            $this->staffSubjectHttp($a, $h, ['program_id' => $a['program']->id])->assertOk()->assertExactJson($expected);
            foreach ([$b['program']->id, $a['invalidBatch']->program_id, 999999] as $id) $this->staffSubjectHttp($a, $h, ['program_id' => $id])->assertOk()->assertJsonPath('data', []);
            $this->staffSubjectHttp($a, $h, ['program_id' => 'bad'])->assertUnprocessable();
            $this->staffSubjectHttp($a, (string) $b['department']->id)->assertForbidden();
            $this->api('GET', $this->hostOf($a['i']), 'subjects', $a['admin'])->assertOk()->assertJsonStructure(['data' => [['full_marks', 'pass_marks', 'teacher_id', 'is_optional']]]);
            Tenancy::as($a['i'], function () use ($a) { \App\Models\BatchTeacher::where('batch_id', $a['classBatch']->id)->delete(); $a['assignment']->delete(); });
            $this->staffSubjectHttp($a, $h)->assertOk()->assertJsonPath('data', []);
        }
    }

    public function test_staff_subject_index_context_and_resource_revocation_are_fresh(): void
    {
        $a = $this->academicFixture('subject-revoke');
        [$other, $member] = Tenancy::as($a['i'], function () use ($a) {
            $s = app(DepartmentService::class); $other = $s->create($a['admin'], ['name' => 'Subject context']);
            $member = $s->addMember($a['admin'], $other->id, ['user_id' => $a['user']->id]);
            $d = $s->createDuty($a['admin'], $other->id, ['code' => 'SUBJECT', 'name' => 'Subject', 'permission_keys' => ['staff.subject.index']]);
            $s->assignDuties($a['admin'], $member->id, ['duty_ids' => [$d->id]]); return [$other, $member];
        });
        $token = $a['user']->createToken('subject-same-token')->plainTextToken; $h = (string) $other->id;
        $this->staffSubjectHttp($a, (string) $a['department']->id, ['department_id' => $other->id], token: $token)->assertForbidden();
        $this->staffSubjectHttp($a, $h, token: $token)->assertOk()->assertJsonCount(1, 'data');
        foreach (['completed', 'archived'] as $status) {
            Tenancy::as($a['i'], fn () => $a['subjectBatch']->update(['status' => $status]));
            $this->staffSubjectHttp($a, $h, token: $token)->assertOk()->assertJsonPath('data', []);
        }
        Tenancy::as($a['i'], fn () => $a['subjectBatch']->update(['status' => 'upcoming']));
        $this->staffSubjectHttp($a, $h, token: $token)->assertOk()->assertJsonCount(1, 'data');
        Tenancy::as($a['i'], fn () => $member->update(['ends_at' => today()->subDay()]));
        $this->staffSubjectHttp($a, $h, token: $token)->assertForbidden();
        Tenancy::as($a['i'], function () use ($member) { $member->update(['ends_at' => null]); DepartmentDutyAssignment::where('membership_id', $member->id)->update(['status' => 'revoked']); });
        $this->staffSubjectHttp($a, $h, token: $token)->assertForbidden();
        Tenancy::as($a['i'], function () use ($member, $other) { DepartmentDutyAssignment::where('membership_id', $member->id)->update(['status' => 'active']); $other->update(['status' => 'archived']); });
        $this->staffSubjectHttp($a, $h, token: $token)->assertForbidden();
    }

    public function test_staff_subject_index_rejects_headers_identity_and_other_actions(): void
    {
        $a = $this->fixture('subject-profile'); $h = (string) $a['department']->id;
        Tenancy::as($a['i'], fn () => $a['duty']->update(['permission_keys' => ['staff.subject.index']]));
        $this->staffSubjectHttp($a, $h)->assertForbidden();
        $teacher = Tenancy::as($a['i'], fn () => Teacher::create(['user_id' => $a['user']->id, 'employee_id' => 'SUBJECT-T', 'status' => 'active']));
        foreach ([null, '', '0', '1,1', ['1', '1'], '[1]', (string) PHP_INT_MAX.'0'] as $bad) $this->staffSubjectHttp($a, $bad, ['department_id' => $a['department']->id])->assertForbidden();
        $this->staffSubjectHttp($a, $h, token: $a['user']->createToken('support', ['impersonated'])->plainTextToken)->assertForbidden();
        Tenancy::as($a['i'], fn () => $teacher->update(['status' => 'inactive']));
        $this->staffSubjectHttp($a, $h)->assertForbidden();
        Tenancy::as($a['i'], fn () => $teacher->update(['status' => 'active']));
        $token = $a['user']->createToken('subject-bounded')->plainTextToken;
        foreach ([['GET', 'subjects/999999'], ['POST', 'subjects'], ['PUT', 'subjects/999999'], ['DELETE', 'subjects/999999'], ['GET', 'batches/999999/students'], ['GET', 'programs']] as [$method, $path]) {
            $this->app['auth']->forgetGuards();
            $this->json($method, 'http://'.$this->hostOf($a['i']).'/api/v1/'.$path, [], ['Authorization' => 'Bearer '.$token, 'X-Department-Id' => $h])->assertForbidden();
        }
        Tenancy::as($a['i'], fn () => Teacher::create(['user_id' => $a['user']->id, 'employee_id' => 'SUBJECT-DUP'])->delete());
        $this->staffSubjectHttp($a, $h)->assertForbidden();
    }

    private function staffProgramShowHttp(array $fixture, int $id, $header = null, array $query = [], string $method = 'GET', ?string $token = null): \Illuminate\Testing\TestResponse
    {
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer '.($token ?? $fixture['user']->createToken('program-show-http')->plainTextToken)];
        if ($header !== null) $headers['X-Department-Id'] = $header;
        return $this->json($method, 'http://'.$this->hostOf($fixture['i']).'/api/v1/programs/'.$id.($query ? '?'.http_build_query($query) : ''), [], $headers);
    }

    public function test_staff_program_show_only_exposes_own_program_name_with_its_exact_key_across_four_types(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            $a = $this->academicFixture('program-show-'.$type, $type); $b = $this->academicFixture('program-show-foreign-'.$type, $type);
            $header = (string) $a['department']->id; $id = $a['program']->id;
            $this->staffProgramShowHttp($a, $id, $header)->assertForbidden();
            $historical = Tenancy::as($a['i'], function () use ($a) {
                $a['duty']->update(['permission_keys' => ['staff.program.index', 'staff.batch.show', 'staff.batch.index']]);
                $a['program']->update(['course_fee' => '99.50']);
                $program = \App\Models\Program::create(['name' => 'Historical only']);
                \App\Models\Batch::create(['program_id' => $program->id, 'name' => 'Old', 'teacher_id' => $a['teacher']->id, 'status' => 'completed']);
                return $program;
            });
            $this->staffProgramShowHttp($a, $id, $header)->assertForbidden();
            Tenancy::as($a['i'], fn () => $a['duty']->update(['permission_keys' => ['staff.program.show']]));
            $expected = ['success' => true, 'data' => ['id' => $id, 'name' => 'Own program']];
            $this->staffProgramShowHttp($a, $id, $header, ['id' => $b['program']->id, 'teacher_id' => $b['teacher']->id])->assertOk()->assertExactJson($expected);
            $this->staffProgramShowHttp($a, $id, $header, method: 'HEAD')->assertOk();
            Tenancy::as($a['i'], fn () => $a['classBatch']->update(['teacher_id' => null]));
            $this->staffProgramShowHttp($a, $id, $header)->assertOk()->assertExactJson($expected); // real subject assignment still qualifies
            foreach ([$b['program']->id, $a['invalidBatch']->program_id, $historical->id, 999999] as $otherId) {
                $this->staffProgramShowHttp($a, $otherId, $header, ['id' => $id])->assertNotFound();
            }
            $this->staffProgramShowHttp($a, $id)->assertForbidden();
            $this->staffProgramShowHttp($a, $id, (string) $b['department']->id)->assertForbidden();
            $this->staffProgramHttp($a, $header)->assertForbidden();
            $this->api('GET', $this->hostOf($a['i']), 'programs/'.$id, $a['admin'])->assertOk()->assertJsonStructure(['data' => ['course_fee', 'batches_count']]);
        }
    }

    public function test_staff_program_show_rechecks_selected_context_and_ownership_with_the_same_token(): void
    {
        $a = $this->academicFixture('program-show-switch');
        [$other, $member, $duty] = Tenancy::as($a['i'], function () use ($a) {
            $a['duty']->update(['permission_keys' => ['staff.program.index']]);
            $manage = app(DepartmentService::class);
            $department = $manage->create($a['admin'], ['name' => 'Other']);
            $member = $manage->addMember($a['admin'], $department->id, ['user_id' => $a['user']->id]);
            $duty = $manage->createDuty($a['admin'], $department->id, ['code' => 'SHOW', 'name' => 'Show', 'permission_keys' => ['staff.program.show']]);
            $manage->assignDuties($a['admin'], $member->id, ['duty_ids' => [$duty->id]]);
            return [$department, $member, $duty];
        });
        $id = $a['program']->id; $header = (string) $other->id; $token = $a['user']->createToken('program-show-same-token')->plainTextToken;
        $this->staffProgramShowHttp($a, $id, (string) $a['department']->id, ['department_id' => $other->id], token: $token)->assertForbidden();
        $this->staffProgramShowHttp($a, $id, $header, token: $token)->assertOk();
        Tenancy::as($a['i'], function () use ($a) {
            $a['classBatch']->update(['teacher_id' => null]);
            $a['subjectBatch']->update(['status' => 'archived']);
        });
        $this->staffProgramShowHttp($a, $id, $header, token: $token)->assertNotFound();
        Tenancy::as($a['i'], function () use ($a, $member) {
            $a['subjectBatch']->update(['status' => 'running']);
            $member->update(['ends_at' => today()->subDay()]);
        });
        $this->staffProgramShowHttp($a, $id, $header, token: $token)->assertForbidden();
        Tenancy::as($a['i'], function () use ($member) {
            $member->update(['ends_at' => null]);
            DepartmentDutyAssignment::where('membership_id', $member->id)->update(['status' => 'revoked']);
        });
        $this->staffProgramShowHttp($a, $id, $header, token: $token)->assertForbidden();
        Tenancy::as($a['i'], function () use ($member, $other) {
            DepartmentDutyAssignment::where('membership_id', $member->id)->update(['status' => 'active']);
            $other->update(['status' => 'archived']);
        });
        $this->staffProgramShowHttp($a, $id, $header, token: $token)->assertForbidden();
    }

    public function test_staff_program_show_rejects_invalid_headers_profiles_and_write_access(): void
    {
        $a = $this->fixture('program-show-profile');
        Tenancy::as($a['i'], fn () => $a['duty']->update(['permission_keys' => ['staff.program.show']]));
        $header = (string) $a['department']->id;
        $this->staffProgramShowHttp($a, 999999, $header)->assertForbidden();
        $teacher = Tenancy::as($a['i'], fn () => Teacher::create(['user_id' => $a['user']->id, 'employee_id' => 'PROGRAM-SHOW-T', 'status' => 'active']));
        foreach ([null, '', '0', '1,1', ['1', '1'], '[1]', (string) PHP_INT_MAX.'0'] as $invalid) {
            $this->staffProgramShowHttp($a, 999999, $invalid, ['department_id' => $a['department']->id])->assertForbidden();
        }
        $support = $a['user']->createToken('program-show-support', ['impersonated'])->plainTextToken;
        $this->staffProgramShowHttp($a, 999999, $header, token: $support)->assertForbidden();
        Tenancy::as($a['i'], fn () => $teacher->update(['status' => 'inactive']));
        $this->staffProgramShowHttp($a, 999999, $header)->assertForbidden();
        Tenancy::as($a['i'], fn () => $teacher->update(['status' => 'active']));
        $token = $a['user']->createToken('program-show-bounded')->plainTextToken;
        foreach ([['PUT', 'programs/999999'], ['DELETE', 'programs/999999'], ['POST', 'programs'], ['GET', 'batches/999999/students']] as [$method, $path]) {
            $this->app['auth']->forgetGuards();
            $this->json($method, 'http://'.$this->hostOf($a['i']).'/api/v1/'.$path, [],
                ['Authorization' => 'Bearer '.$token, 'X-Department-Id' => $header])->assertForbidden();
        }
        Tenancy::as($a['i'], fn () => Teacher::create(['user_id' => $a['user']->id, 'employee_id' => 'PROGRAM-SHOW-DUP', 'status' => 'active'])->delete());
        $this->staffProgramShowHttp($a, 999999, $header)->assertForbidden();
    }

    private function staffBatchShowHttp(array $fixture, int $id, $header = null, array $query = [], string $method = 'GET', ?string $token = null): \Illuminate\Testing\TestResponse
    {
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer '.($token ?? $fixture['user']->createToken('batch-show-http')->plainTextToken)];
        if ($header !== null) $headers['X-Department-Id'] = $header;
        return $this->json($method, 'http://'.$this->hostOf($fixture['i']).'/api/v1/batches/'.$id.($query ? '?'.http_build_query($query) : ''), [], $headers);
    }

    public function test_staff_batch_show_requires_its_exact_key_and_own_resource_across_four_types(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            $a = $this->academicFixture('batch-show-'.$type, $type); $b = $this->academicFixture('batch-show-foreign-'.$type, $type);
            $header = (string) $a['department']->id;
            $this->staffBatchShowHttp($a, $a['classBatch']->id, $header)->assertForbidden();
            Tenancy::as($a['i'], fn () => $a['duty']->update(['permission_keys' => ['staff.batch.show']]));
            foreach ([$a['classBatch'], $a['subjectBatch']] as $batch) {
                $expected = ['success' => true, 'data' => ['id' => $batch->id, 'name' => $batch->name, 'status' => $batch->status,
                    'program' => ['id' => $a['program']->id, 'name' => 'Own program']]];
                $this->staffBatchShowHttp($a, $batch->id, $header, ['id' => $b['classBatch']->id, 'teacher_id' => $b['teacher']->id])->assertOk()->assertExactJson($expected);
            }
            $this->staffBatchShowHttp($a, $a['classBatch']->id, $header, method: 'HEAD')->assertOk();
            foreach ([$a['unassigned']->id, $a['invalidBatch']->id, $b['classBatch']->id, 999999] as $id) {
                $this->staffBatchShowHttp($a, $id, $header, ['id' => $a['classBatch']->id])->assertNotFound();
            }
            Tenancy::as($a['i'], fn () => $a['classBatch']->update(['status' => 'completed']));
            $this->staffBatchShowHttp($a, $a['classBatch']->id, $header)->assertNotFound();
            Tenancy::as($a['i'], fn () => $a['subjectBatch']->update(['status' => 'archived']));
            $this->staffBatchShowHttp($a, $a['subjectBatch']->id, $header)->assertNotFound();
            $this->staffBatchShowHttp($a, $a['classBatch']->id)->assertForbidden();
            $this->staffBatchShowHttp($a, $a['classBatch']->id, (string) $b['department']->id)->assertForbidden();
            $this->staffBatchListHttp($a, $header)->assertForbidden();
            $this->api('GET', $this->hostOf($a['i']), 'batches/'.$a['classBatch']->id, $a['admin'])->assertOk()
                ->assertJsonStructure(['data' => ['monthly_fee', 'students_count', 'teacher', 'subject_teachers']]);
        }
    }

    public function test_staff_batch_show_rechecks_context_key_revocation_and_assignment_with_the_same_token(): void
    {
        $a = $this->academicFixture('batch-show-switch');
        [$other, $member, $duty] = Tenancy::as($a['i'], function () use ($a) {
            $a['duty']->update(['permission_keys' => ['staff.batch.index', 'staff.batch.mine', 'staff.program.index']]);
            $manage = app(DepartmentService::class);
            $department = $manage->create($a['admin'], ['name' => 'Other']);
            $member = $manage->addMember($a['admin'], $department->id, ['user_id' => $a['user']->id]);
            $duty = $manage->createDuty($a['admin'], $department->id, ['code' => 'SHOW', 'name' => 'Show', 'permission_keys' => ['staff.batch.show']]);
            $manage->assignDuties($a['admin'], $member->id, ['duty_ids' => [$duty->id]]);
            return [$department, $member, $duty];
        });
        $token = $a['user']->createToken('batch-show-same-token')->plainTextToken;
        $id = $a['classBatch']->id;
        $this->staffBatchShowHttp($a, $id, (string) $a['department']->id, ['department_id' => $other->id], token: $token)->assertForbidden();
        $this->staffBatchShowHttp($a, $id, (string) $other->id, token: $token)->assertOk();
        Tenancy::as($a['i'], fn () => $a['classBatch']->update(['teacher_id' => null]));
        $this->staffBatchShowHttp($a, $id, (string) $other->id, token: $token)->assertNotFound();
        Tenancy::as($a['i'], function () use ($a, $member) {
            $a['classBatch']->update(['teacher_id' => $a['teacher']->id]);
            $member->update(['starts_at' => today()->addDay()]);
        });
        $this->staffBatchShowHttp($a, $id, (string) $other->id, token: $token)->assertForbidden();
        Tenancy::as($a['i'], function () use ($member) {
            $member->update(['starts_at' => null]);
            DepartmentDutyAssignment::where('membership_id', $member->id)->update(['status' => 'revoked']);
        });
        $this->staffBatchShowHttp($a, $id, (string) $other->id, token: $token)->assertForbidden();
        Tenancy::as($a['i'], function () use ($member, $other) {
            DepartmentDutyAssignment::where('membership_id', $member->id)->update(['status' => 'active']);
            $other->update(['status' => 'archived']);
        });
        $this->staffBatchShowHttp($a, $id, (string) $other->id, token: $token)->assertForbidden();
    }

    public function test_staff_batch_show_rejects_invalid_context_profile_and_unrelated_admin_actions(): void
    {
        $a = $this->fixture('batch-show-profile');
        Tenancy::as($a['i'], fn () => $a['duty']->update(['permission_keys' => ['staff.batch.show']]));
        $header = (string) $a['department']->id;
        $this->staffBatchShowHttp($a, 999999, $header)->assertForbidden();
        $teacher = Tenancy::as($a['i'], fn () => Teacher::create(['user_id' => $a['user']->id, 'employee_id' => 'SHOW-T', 'status' => 'active']));
        foreach ([null, '', '0', '1,1', ['1', '1'], '[1]', (string) PHP_INT_MAX.'0'] as $invalid) {
            $this->staffBatchShowHttp($a, 999999, $invalid, ['department_id' => $a['department']->id])->assertForbidden();
        }
        $support = $a['user']->createToken('batch-show-support', ['impersonated'])->plainTextToken;
        $this->staffBatchShowHttp($a, 999999, $header, token: $support)->assertForbidden();
        Tenancy::as($a['i'], fn () => $teacher->update(['status' => 'inactive']));
        $this->staffBatchShowHttp($a, 999999, $header)->assertForbidden();
        Tenancy::as($a['i'], fn () => $teacher->update(['status' => 'active']));
        $token = $a['user']->createToken('batch-show-bounded')->plainTextToken;
        foreach ([['PUT', 'batches/999999'], ['DELETE', 'batches/999999'], ['GET', 'batches/999999/students'], ['GET', 'programs/999999']] as [$method, $path]) {
            $this->app['auth']->forgetGuards();
            $this->json($method, 'http://'.$this->hostOf($a['i']).'/api/v1/'.$path, [],
                ['Authorization' => 'Bearer '.$token, 'X-Department-Id' => $header])->assertForbidden();
        }
        Tenancy::as($a['i'], fn () => Teacher::create(['user_id' => $a['user']->id, 'employee_id' => 'SHOW-DUP', 'status' => 'active'])->delete());
        $this->staffBatchShowHttp($a, 999999, $header)->assertForbidden();
    }

    private function staffBatchListHttp(array $fixture, $header = null, array $query = [], string $method = 'GET', ?string $token = null): \Illuminate\Testing\TestResponse
    {
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer '.($token ?? $fixture['user']->createToken('batch-list-http')->plainTextToken)];
        if ($header !== null) $headers['X-Department-Id'] = $header;
        return $this->json($method, 'http://'.$this->hostOf($fixture['i']).'/api/v1/batches'.($query ? '?'.http_build_query($query) : ''), [], $headers);
    }

    public function test_staff_batch_list_only_returns_own_metadata_with_its_exact_key_across_four_types(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            $a = $this->academicFixture('batch-list-'.$type, $type); $b = $this->academicFixture('batch-list-foreign-'.$type, $type);
            $this->staffBatchListHttp($a, (string) $a['department']->id)->assertForbidden();
            Tenancy::as($a['i'], fn () => $a['duty']->update(['permission_keys' => ['staff.batch.index']]));
            $expected = ['success' => true, 'data' => [
                ['id' => $a['classBatch']->id, 'name' => 'A', 'status' => 'upcoming', 'program' => ['id' => $a['program']->id, 'name' => 'Own program']],
                ['id' => $a['subjectBatch']->id, 'name' => 'B', 'status' => 'running', 'program' => ['id' => $a['program']->id, 'name' => 'Own program']],
            ]];
            $this->staffBatchListHttp($a, (string) $a['department']->id)->assertOk()->assertExactJson($expected);
            $this->staffBatchListHttp($a, (string) $a['department']->id, ['status' => 'all', 'user_id' => $b['user']->id, 'teacher_id' => $b['teacher']->id, 'department_id' => $b['department']->id])
                ->assertOk()->assertExactJson($expected);
            $this->staffBatchListHttp($a, (string) $a['department']->id, method: 'HEAD')->assertOk();
            $this->staffBatchListHttp($a)->assertForbidden();
            $this->staffBatchListHttp($a, (string) $b['department']->id)->assertForbidden();
            $this->ownBatchHttp($a, (string) $a['department']->id)->assertForbidden();
            $this->staffProgramHttp($a, (string) $a['department']->id)->assertForbidden();
            $this->api('GET', $this->hostOf($a['i']), 'batches', $a['admin'])->assertOk()->assertJsonStructure(['data' => [['monthly_fee', 'students_count', 'teacher']]]);
        }
    }

    public function test_staff_batch_filters_only_narrow_ownership_and_never_restore_historical_or_unassigned_rows(): void
    {
        $a = $this->academicFixture('batch-list-filters'); $foreign = $this->academicFixture('batch-filter-foreign');
        $other = Tenancy::as($a['i'], function () use ($a) {
            $a['duty']->update(['permission_keys' => ['staff.batch.index']]);
            $program = \App\Models\Program::create(['name' => 'Second owned program']);
            return \App\Models\Batch::create(['program_id' => $program->id, 'teacher_id' => $a['teacher']->id, 'name' => 'C', 'status' => 'running']);
        });
        $header = (string) $a['department']->id;
        $this->staffBatchListHttp($a, $header, ['status' => 'all'])->assertOk()->assertJsonCount(3, 'data');
        $this->staffBatchListHttp($a, $header, ['program_id' => $a['program']->id])->assertOk()->assertJsonCount(2, 'data');
        $this->staffBatchListHttp($a, $header, ['program_id' => $other->program_id, 'status' => 'running'])->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $other->id);
        $this->staffBatchListHttp($a, $header, ['status' => 'upcoming'])->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $a['classBatch']->id);
        foreach ([['status' => 'completed'], ['status' => 'archived'], ['program_id' => $a['invalidBatch']->program_id], ['program_id' => $foreign['program']->id]] as $query) {
            $this->staffBatchListHttp($a, $header, $query)->assertOk()->assertExactJson(['success' => true, 'data' => []]);
        }
        foreach ([['status' => 'unknown'], ['program_id' => ['1']], ['program_id' => 'invalid']] as $query) {
            $this->staffBatchListHttp($a, $header, $query)->assertUnprocessable();
        }
    }

    public function test_staff_batch_list_rechecks_context_duties_profile_and_revocation_with_the_same_token(): void
    {
        $a = $this->academicFixture('batch-list-auth');
        [$other, $member, $duty] = Tenancy::as($a['i'], function () use ($a) {
            $a['duty']->update(['permission_keys' => ['staff.batch.index']]);
            $manage = app(DepartmentService::class);
            $department = $manage->create($a['admin'], ['name' => 'Other']);
            $member = $manage->addMember($a['admin'], $department->id, ['user_id' => $a['user']->id]);
            $duty = $manage->createDuty($a['admin'], $department->id, ['code' => 'OTHER', 'name' => 'Other', 'permission_keys' => ['staff.program.index']]);
            $manage->assignDuties($a['admin'], $member->id, ['duty_ids' => [$duty->id]]);
            return [$department, $member, $duty];
        });
        $token = $a['user']->createToken('batch-list-same-token')->plainTextToken;
        $header = (string) $a['department']->id;
        $this->staffBatchListHttp($a, $header, token: $token)->assertOk();
        $this->staffBatchListHttp($a, (string) $other->id, ['department_id' => $a['department']->id], token: $token)->assertForbidden();
        Tenancy::as($a['i'], fn () => $duty->update(['permission_keys' => ['staff.batch.index']]));
        $this->staffBatchListHttp($a, (string) $other->id, token: $token)->assertOk();
        Tenancy::as($a['i'], fn () => DepartmentDutyAssignment::where('membership_id', $member->id)->update(['status' => 'revoked']));
        $this->staffBatchListHttp($a, (string) $other->id, token: $token)->assertForbidden();
        Tenancy::as($a['i'], fn () => $a['membership']->update(['ends_at' => today()->subDay()]));
        $this->staffBatchListHttp($a, $header, token: $token)->assertForbidden();
        Tenancy::as($a['i'], fn () => $a['membership']->update(['ends_at' => null]));
        foreach ([null, '', '0', '1,1', ['1', '1'], '[1]', (string) PHP_INT_MAX.'0'] as $invalid) {
            $this->staffBatchListHttp($a, $invalid, ['department_id' => $a['department']->id])->assertForbidden();
        }
        $support = $a['user']->createToken('batch-list-support', ['impersonated'])->plainTextToken;
        $this->staffBatchListHttp($a, $header, token: $support)->assertForbidden();
        Tenancy::as($a['i'], fn () => $a['teacher']->update(['status' => 'inactive']));
        $this->staffBatchListHttp($a, $header, token: $token)->assertForbidden();
        Tenancy::as($a['i'], function () use ($a) {
            $a['teacher']->update(['status' => 'active']);
            Teacher::create(['user_id' => $a['user']->id, 'employee_id' => 'BATCH-LIST-DUP', 'status' => 'active'])->delete();
        });
        $this->staffBatchListHttp($a, $header, token: $token)->assertForbidden();
    }

    private function staffProgramHttp(array $fixture, $header = null, array $query = [], string $method = 'GET', ?string $token = null): \Illuminate\Testing\TestResponse
    {
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer '.($token ?? $fixture['user']->createToken('program-http')->plainTextToken)];
        if ($header !== null) $headers['X-Department-Id'] = $header;
        return $this->json($method, 'http://'.$this->hostOf($fixture['i']).'/api/v1/programs'.($query ? '?'.http_build_query($query) : ''), [], $headers);
    }

    public function test_staff_program_http_only_returns_owned_program_names_with_an_independent_exact_key_across_four_types(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            $a = $this->academicFixture('program-http-'.$type, $type); $b = $this->academicFixture('program-foreign-'.$type, $type);
            $this->staffProgramHttp($a, (string) $a['department']->id)->assertForbidden(); // batch.mine is not program.index
            Tenancy::as($a['i'], function () use ($a) {
                $a['duty']->update(['permission_keys' => ['staff.program.index']]);
                $a['program']->update(['course_fee' => '99.50']);
                $completed = \App\Models\Program::create(['name' => 'Only completed own batches', 'course_fee' => '800.00']);
                \App\Models\Batch::create(['program_id' => $completed->id, 'teacher_id' => $a['teacher']->id, 'name' => 'Old', 'status' => 'completed']);
                StaffMember::factory()->create(['user_id' => $a['user']->id]);
            });
            $expected = ['success' => true, 'data' => [['id' => $a['program']->id, 'name' => 'Own program']]];
            $this->staffProgramHttp($a, (string) $a['department']->id)->assertOk()->assertExactJson($expected);
            $this->staffProgramHttp($a, (string) $a['department']->id, ['teacher_id' => $b['teacher']->id, 'user_id' => $b['user']->id, 'department_id' => $b['department']->id])
                ->assertOk()->assertExactJson($expected);
            $this->staffProgramHttp($a, (string) $a['department']->id, method: 'HEAD')->assertOk();
            $this->staffProgramHttp($a)->assertForbidden();
            $this->staffProgramHttp($a, (string) $b['department']->id)->assertForbidden();
            $this->ownBatchHttp($a, (string) $a['department']->id)->assertForbidden(); // program.index is not batch.mine
            $this->api('GET', $this->hostOf($a['i']), 'programs', $a['admin'])->assertOk()->assertJsonStructure(['data' => [['course_fee', 'batches_count']]]);
        }
    }

    public function test_staff_program_http_rechecks_context_keys_ownership_and_revocation_with_the_same_token(): void
    {
        $a = $this->academicFixture('program-switch');
        [$other, $member, $duty] = Tenancy::as($a['i'], function () use ($a) {
            $a['duty']->update(['permission_keys' => ['staff.program.index']]);
            $manage = app(DepartmentService::class);
            $department = $manage->create($a['admin'], ['name' => 'Other']);
            $member = $manage->addMember($a['admin'], $department->id, ['user_id' => $a['user']->id]);
            $duty = $manage->createDuty($a['admin'], $department->id, ['code' => 'OTHER', 'name' => 'Other', 'permission_keys' => ['staff.batch.mine']]);
            $manage->assignDuties($a['admin'], $member->id, ['duty_ids' => [$duty->id]]);
            return [$department, $member, $duty];
        });
        $token = $a['user']->createToken('program-same-token')->plainTextToken;
        $this->staffProgramHttp($a, (string) $a['department']->id, token: $token)->assertOk()->assertJsonCount(1, 'data');
        $this->staffProgramHttp($a, (string) $other->id, ['department_id' => $a['department']->id], token: $token)->assertForbidden();
        Tenancy::as($a['i'], fn () => $duty->update(['permission_keys' => ['staff.program.index']]));
        $this->staffProgramHttp($a, (string) $other->id, token: $token)->assertOk();
        Tenancy::as($a['i'], fn () => $a['duty']->update(['permission_keys' => ['staff.batch.mine']]));
        $this->staffProgramHttp($a, (string) $a['department']->id, token: $token)->assertForbidden();
        Tenancy::as($a['i'], fn () => $member->update(['starts_at' => today()->addDay()]));
        $this->staffProgramHttp($a, (string) $other->id, token: $token)->assertForbidden();
        Tenancy::as($a['i'], function () use ($member) {
            $member->update(['starts_at' => null]);
            DepartmentDutyAssignment::where('membership_id', $member->id)->update(['status' => 'revoked']);
        });
        $this->staffProgramHttp($a, (string) $other->id, token: $token)->assertForbidden();
        Tenancy::as($a['i'], function () use ($member, $a) {
            DepartmentDutyAssignment::where('membership_id', $member->id)->update(['status' => 'active']);
            $a['classBatch']->update(['teacher_id' => null]);
            $a['subjectBatch']->update(['status' => 'archived']);
        });
        $this->staffProgramHttp($a, (string) $other->id, token: $token)->assertOk()->assertExactJson(['success' => true, 'data' => []]);
        Tenancy::as($a['i'], fn () => $other->update(['status' => 'archived']));
        $this->staffProgramHttp($a, (string) $other->id, token: $token)->assertForbidden();
    }

    public function test_staff_program_http_rejects_invalid_headers_profiles_and_unrelated_routes(): void
    {
        $a = $this->fixture('program-profile');
        Tenancy::as($a['i'], fn () => $a['duty']->update(['permission_keys' => ['staff.program.index']]));
        $this->staffProgramHttp($a, (string) $a['department']->id)->assertForbidden();
        $teacher = Tenancy::as($a['i'], fn () => Teacher::create(['user_id' => $a['user']->id, 'employee_id' => 'PROGRAM-T', 'status' => 'active']));
        $this->staffProgramHttp($a, (string) $a['department']->id)->assertOk()->assertExactJson(['success' => true, 'data' => []]);
        foreach ([null, '', '0', '+1', '1e0', '1,1', ['1', '1'], '[1]', (string) PHP_INT_MAX.'0'] as $header) {
            $this->staffProgramHttp($a, $header, ['department_id' => $a['department']->id])->assertForbidden();
        }
        $support = $a['user']->createToken('program-support', ['impersonated'])->plainTextToken;
        $this->staffProgramHttp($a, (string) $a['department']->id, token: $support)->assertForbidden();
        Tenancy::as($a['i'], fn () => $teacher->update(['status' => 'inactive']));
        $this->staffProgramHttp($a, (string) $a['department']->id)->assertForbidden();
        Tenancy::as($a['i'], fn () => $teacher->update(['status' => 'active']));
        $token = $a['user']->createToken('program-bounded')->plainTextToken;
        foreach (['batches', 'programs/999999', 'teacher/dashboard', 'accountant/reports/dues'] as $path) {
            $this->app['auth']->forgetGuards();
            $this->getJson('http://'.$this->hostOf($a['i']).'/api/v1/'.$path,
                ['Authorization' => 'Bearer '.$token, 'X-Department-Id' => (string) $a['department']->id])->assertForbidden();
        }
        Tenancy::as($a['i'], fn () => Teacher::create(['user_id' => $a['user']->id, 'employee_id' => 'PROGRAM-DUP', 'status' => 'active'])->delete());
        $this->staffProgramHttp($a, (string) $a['department']->id)->assertForbidden();
    }

    private function ownBatchHttp(array $fixture, $header = null, array $input = [], string $method = 'GET', ?string $token = null): \Illuminate\Testing\TestResponse
    {
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer '.($token ?? $fixture['user']->createToken('own-batch-http')->plainTextToken)];
        if ($header !== null) $headers['X-Department-Id'] = $header;
        return $this->json($method, 'http://'.$this->hostOf($fixture['i']).'/api/v1/teacher/batches', $input, $headers);
    }

    public function test_staff_own_batch_http_returns_only_assigned_metadata_across_four_types(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            $a = $this->academicFixture('batch-http-'.$type, $type);
            $b = $this->academicFixture('batch-foreign-'.$type, $type);
            $expected = ['success' => true, 'data' => [
                ['id' => $a['classBatch']->id, 'name' => 'A', 'program' => ['id' => $a['program']->id, 'name' => 'Own program'], 'is_class_teacher' => true],
                ['id' => $a['subjectBatch']->id, 'name' => 'B', 'program' => ['id' => $a['program']->id, 'name' => 'Own program'], 'is_class_teacher' => false],
            ]];
            $before = [$a['user']->fresh()->getAttributes(), Tenancy::as($a['i'], fn () => $a['teacher']->fresh()->getAttributes())];
            $this->ownBatchHttp($a, (string) $a['department']->id)->assertOk()->assertExactJson($expected);
            $this->ownBatchHttp($a, (string) $a['department']->id, ['user_id' => $b['user']->id, 'teacher_id' => $b['teacher']->id, 'department_id' => $b['department']->id])
                ->assertOk()->assertExactJson($expected);
            $this->ownBatchHttp($a, (string) $a['department']->id, method: 'HEAD')->assertOk();
            $this->ownBatchHttp($a)->assertForbidden();
            $this->ownBatchHttp($a, (string) $b['department']->id)->assertForbidden();
            $this->assertSame($before, [$a['user']->fresh()->getAttributes(), Tenancy::as($a['i'], fn () => $a['teacher']->fresh()->getAttributes())]);
            $this->api('GET', $this->hostOf($a['i']), 'teacher/batches', $a['admin'])->assertForbidden();
            $this->api('GET', $this->hostOf($a['i']), 'teacher/batches')->assertUnauthorized();
        }
    }

    public function test_staff_own_batch_http_rejects_header_injection_and_other_business_routes_stay_closed(): void
    {
        $a = $this->academicFixture('batch-http-selector');
        foreach ([null, '', '0', '-1', '1e0', '1,1', ['1', '1'], '[1]', (string) PHP_INT_MAX.'0'] as $header) {
            $this->ownBatchHttp($a, $header, ['department_id' => $a['department']->id, 'X-Department-Id' => $a['department']->id])->assertForbidden();
        }
        $token = $a['user']->createToken('bounded-route')->plainTextToken;
        foreach (['programs', 'batches', 'teacher/dashboard', 'accountant/reports/dues', 'admin/departments'] as $path) {
            $this->app['auth']->forgetGuards();
            $this->getJson('http://'.$this->hostOf($a['i']).'/api/v1/'.$path,
                ['Authorization' => 'Bearer '.$token, 'X-Department-Id' => (string) $a['department']->id])->assertForbidden();
        }
        $this->ownBatchHttp($a, (string) $a['department']->id)->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_staff_own_batch_http_rechecks_selected_context_and_revocation_with_the_same_token(): void
    {
        $a = $this->academicFixture('batch-http-switch');
        [$other, $otherMember, $otherDuty] = Tenancy::as($a['i'], function () use ($a) {
            $manage = app(DepartmentService::class);
            $other = $manage->create($a['admin'], ['name' => 'Other']);
            $member = $manage->addMember($a['admin'], $other->id, ['user_id' => $a['user']->id]);
            $duty = $manage->createDuty($a['admin'], $other->id, ['code' => 'OTHER', 'name' => 'Other', 'permission_keys' => ['staff.report.dues']]);
            $manage->assignDuties($a['admin'], $member->id, ['duty_ids' => [$duty->id]]);
            return [$other, $member, $duty];
        });
        $token = $a['user']->createToken('same-token')->plainTextToken;
        $this->ownBatchHttp($a, (string) $a['department']->id, token: $token)->assertOk();
        $this->ownBatchHttp($a, (string) $other->id, ['department_id' => $a['department']->id], token: $token)->assertForbidden();
        Tenancy::as($a['i'], fn () => $otherDuty->update(['permission_keys' => ['staff.batch.mine']]));
        $this->ownBatchHttp($a, (string) $other->id, token: $token)->assertOk()->assertJsonCount(2, 'data');
        Tenancy::as($a['i'], fn () => $otherMember->update(['ends_at' => today()->subDay()]));
        $this->ownBatchHttp($a, (string) $other->id, token: $token)->assertForbidden();
        Tenancy::as($a['i'], fn () => DepartmentDutyAssignment::where('membership_id', $a['membership']->id)->update(['status' => 'revoked']));
        $this->ownBatchHttp($a, (string) $a['department']->id, token: $token)->assertForbidden();
        Tenancy::as($a['i'], function () use ($a) {
            DepartmentDutyAssignment::where('membership_id', $a['membership']->id)->update(['status' => 'active']);
            $a['department']->update(['status' => 'archived']);
        });
        $this->ownBatchHttp($a, (string) $a['department']->id, token: $token)->assertForbidden();
    }

    public function test_staff_own_batch_http_requires_real_active_unambiguous_teacher_and_rejects_support_tokens(): void
    {
        $a = $this->fixture('batch-http-profile');
        Tenancy::as($a['i'], fn () => $a['duty']->update(['permission_keys' => ['staff.batch.mine']]));
        $this->ownBatchHttp($a, (string) $a['department']->id)->assertForbidden();
        $teacher = Tenancy::as($a['i'], fn () => Teacher::create(['user_id' => $a['user']->id, 'employee_id' => 'HTTP-REAL', 'status' => 'active']));
        Tenancy::as($a['i'], fn () => StaffMember::factory()->create(['user_id' => $a['user']->id]));
        $this->ownBatchHttp($a, (string) $a['department']->id)->assertOk()->assertExactJson(['success' => true, 'data' => []]);
        $support = $a['user']->createToken('support', ['impersonated'])->plainTextToken;
        $this->ownBatchHttp($a, (string) $a['department']->id, token: $support)->assertForbidden();
        Tenancy::as($a['i'], fn () => $teacher->update(['status' => 'inactive']));
        $this->ownBatchHttp($a, (string) $a['department']->id)->assertForbidden();
        Tenancy::as($a['i'], fn () => $teacher->update(['status' => 'active']));
        $a['user']->forceFill(['locked_until' => now()->addHour()])->save();
        $this->ownBatchHttp($a, (string) $a['department']->id)->assertForbidden();
        $a['user']->forceFill(['locked_until' => null])->save();
        Tenancy::as($a['i'], fn () => Teacher::create(['user_id' => $a['user']->id, 'employee_id' => 'HTTP-DUP', 'status' => 'active'])->delete());
        $this->ownBatchHttp($a, (string) $a['department']->id)->assertForbidden();
    }

    private function contextRequest($actor, $header = null, string $path = 'accountant/reports/dues', array $input = [], string $method = 'GET'): \Illuminate\Http\Request
    {
        $request = \Illuminate\Http\Request::create('/api/v1/'.$path, $method, $input);
        if ($header !== null) $request->headers->set('X-Department-Id', $header);
        $route = clone app('router')->getRoutes()->match($request);
        $request->setRouteResolver(fn () => $route);
        $request->setUserResolver(fn () => $actor);
        return $request;
    }

    public function test_request_context_accepts_only_one_positive_decimal_header_without_fallback(): void
    {
        extract($this->fixture('request-context-header')); $this->bindTenant($i);
        $service = app(\App\Services\DepartmentRequestContextService::class);
        foreach ([null, '', '0', '000', '-1', '+1', '1.0', '1e0', ' 1', '1 ', '1,2', '1,1', '[1]', '{"id":1}',
            ['1', '2'], ['1', '1'], [], "1\n", "1\0", '١', (string) PHP_INT_MAX.'0'] as $header) {
            $request = $this->contextRequest($user, $header, input: ['department_id' => $department->id, 'X-Department-Id' => $department->id]);
            try { $service->forRoute($request); $this->fail('Invalid/missing selector accepted'); }
            catch (\App\Exceptions\BusinessException $e) { $this->assertSame(403, $e->status); }
        }
        foreach ([(string) $department->id, '000'.$department->id] as $header) {
            $this->assertSame($department->id, $service->forRoute($this->contextRequest($user, $header)));
        }
        $this->assertSame($department->id, $service->forRoute($this->contextRequest($user, (string) $department->id, method: 'HEAD')));
    }

    public function test_request_context_never_unions_other_department_duties_and_switches_fresh_across_four_types(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            extract($this->fixture('request-context-'.$type, $type));
            Tenancy::as($i, function () use ($i, $user, $admin, $department, $membership, $duty) {
                $service = app(\App\Services\DepartmentRequestContextService::class);
                $manage = app(DepartmentService::class);
                $other = $manage->create($admin, ['name' => 'Second context']);
                $otherMember = $manage->addMember($admin, $other->id, ['user_id' => $user->id]);
                $otherDuty = $manage->createDuty($admin, $other->id, ['code' => 'OTHER', 'name' => 'Other', 'permission_keys' => ['staff.batch.mine']]);
                $manage->assignDuties($admin, $otherMember->id, ['duty_ids' => [$otherDuty->id]]);
                $allowed = $this->contextRequest($user, (string) $department->id, input: ['department_id' => $other->id, 'permission' => 'staff.batch.mine']);
                $wrong = $this->contextRequest($user, (string) $other->id, input: ['department_id' => $department->id, 'permission' => 'staff.report.dues']);
                $denied = function ($request) use ($service) {
                    try { $service->forRoute($request); $this->fail('Wrong selected context authorized'); }
                    catch (\App\Exceptions\BusinessException $e) { $this->assertSame(403, $e->status); }
                };
                $this->assertSame($department->id, $service->forRoute($allowed)); $denied($wrong);
                $otherDuty->update(['permission_keys' => ['staff.report.dues']]);
                $this->assertSame($other->id, $service->forRoute($wrong));
                $duty->update(['permission_keys' => ['staff.batch.mine']]); $denied($allowed);
                $this->assertSame($other->id, $service->forRoute($wrong));
                $otherMember->update(['ends_at' => today()->subDay()]); $denied($wrong);
                $otherMember->update(['ends_at' => null]);
                DepartmentDutyAssignment::where('membership_id', $otherMember->id)->update(['status' => 'revoked']); $denied($wrong);
                $membership->update(['starts_at' => today()->addDay()]);
                $duty->update(['permission_keys' => ['staff.report.dues']]); $denied($allowed);
                $membership->update(['starts_at' => null]);
                $this->assertSame($department->id, $service->forRoute($allowed));
                $department->update(['status' => 'archived']); $denied($allowed);
                $this->assertSame('institution_staff', $user->fresh()->role);
            });
            $this->api('GET', $this->hostOf($i), 'accountant/reports/dues', $user)->assertForbidden();
        }
    }

    public function test_request_context_rejects_foreign_identity_impersonation_unknown_principal_and_selector_drift(): void
    {
        $a = $this->academicFixture('request-academic'); $b = $this->fixture('request-foreign');
        $service = app(\App\Services\DepartmentRequestContextService::class);
        $denied = function ($request) use ($service) {
            try { $service->forRoute($request); $this->fail('Unverified route/identity authorized'); }
            catch (\App\Exceptions\BusinessException $e) { $this->assertSame(403, $e->status); }
        };
        Tenancy::as($a['i'], function () use ($a, $b, $service, $denied) {
            $request = $this->contextRequest($a['user'], (string) $a['department']->id, 'teacher/batches');
            $id = $service->forRoute($request);
            $this->assertSame($a['department']->id, $id);
            $this->assertCount(2, app(\App\Services\DepartmentAcademicReadService::class)->ownBatches($a['user'], $id));
            $denied($this->contextRequest($a['user'], (string) $b['department']->id, 'teacher/batches'));
            $denied($this->contextRequest($b['user'], (string) $a['department']->id, 'teacher/batches'));
            $denied($this->contextRequest(null, (string) $a['department']->id, 'teacher/batches'));
            $denied($this->contextRequest($a['admin'], (string) $a['department']->id, 'teacher/batches'));
            $actor = $a['user']->fresh()->withAccessToken($a['user']->createToken('support', ['impersonated'])->accessToken);
            $denied($this->contextRequest($actor, (string) $a['department']->id, 'teacher/batches'));
            Tenancy::withoutTenancy(fn () => $denied($request));
            foreach (['staff/departments', 'admin/departments', 'accountant/reports/unknown', 'admin/reports/dues'] as $path) {
                $denied($this->contextRequest($a['user'], (string) $a['department']->id, $path, ['type' => 'dues', 'permission' => 'staff.batch.mine']));
            }
            $request->route()->setAction(['uses' => 'UnknownController@index', 'controller' => 'UnknownController@index']); $denied($request);
            $a['user']->forceFill(['locked_until' => now()->addHour()])->save();
            $denied($this->contextRequest($a['user'], (string) $a['department']->id, 'teacher/batches'));
        });
    }

    private function academicFixture(string $slug, string $type = 'school'): array
    {
        $base = $this->fixture($slug, $type);
        return Tenancy::as($base['i'], function () use ($base) {
            $base['duty']->update(['permission_keys' => ['staff.batch.mine']]);
            $teacher = Teacher::create(['user_id' => $base['user']->id, 'employee_id' => 'ACADEMIC-T', 'status' => 'active']);
            $program = \App\Models\Program::create(['name' => 'Own program']);
            $subject = \App\Models\Subject::create(['program_id' => $program->id, 'name' => 'Math']);
            $classBatch = \App\Models\Batch::create(['program_id' => $program->id, 'name' => 'A', 'teacher_id' => $teacher->id, 'status' => 'upcoming']);
            $subjectBatch = \App\Models\Batch::create(['program_id' => $program->id, 'name' => 'B', 'status' => 'running']);
            $assignment = \App\Models\BatchTeacher::create(['batch_id' => $subjectBatch->id, 'teacher_id' => $teacher->id, 'subject_id' => $subject->id]);
            $unassigned = \App\Models\Batch::create(['program_id' => $program->id, 'name' => 'Unassigned']);
            $otherProgram = \App\Models\Program::create(['name' => 'Other program']);
            $invalidBatch = \App\Models\Batch::create(['program_id' => $otherProgram->id, 'name' => 'Wrong subject program']);
            \App\Models\BatchTeacher::create(['batch_id' => $invalidBatch->id, 'teacher_id' => $teacher->id, 'subject_id' => $subject->id]);
            \App\Models\Batch::create(['program_id' => $program->id, 'name' => 'Completed', 'teacher_id' => $teacher->id, 'status' => 'completed']);
            \App\Models\Batch::create(['program_id' => $program->id, 'name' => 'Archived', 'teacher_id' => $teacher->id, 'status' => 'archived']);
            return $base + compact('teacher', 'program', 'classBatch', 'subjectBatch', 'assignment', 'unassigned', 'invalidBatch');
        });
    }

    public function test_academic_predicate_only_returns_real_own_class_and_valid_subject_batches_across_four_types(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            $a = $this->academicFixture('academic-'.$type, $type); $b = $this->academicFixture('academic-foreign-'.$type, $type);
            Tenancy::as($a['i'], function () use ($a, $b) {
                $service = app(\App\Services\DepartmentAcademicReadService::class);
                $staff = StaffMember::factory()->create(['user_id' => $a['user']->id]);
                $before = [$a['user']->fresh()->getAttributes(), $a['teacher']->fresh()->getAttributes(), $staff->fresh()->getAttributes()];
                $rows = $service->ownBatches($a['user'], $a['department']->id);
                $this->assertSame([$a['classBatch']->id, $a['subjectBatch']->id], $rows->pluck('id')->all());
                $this->assertNotContains($a['unassigned']->id, $rows->pluck('id')->all());
                $this->assertNotContains($a['invalidBatch']->id, $rows->pluck('id')->all());
                $this->assertNotContains($b['classBatch']->id, $rows->pluck('id')->all());
                $this->assertSame([$a['program']->id], $rows->pluck('program.id')->unique()->values()->all());
                $this->assertSame($before, [$a['user']->fresh()->getAttributes(), $a['teacher']->fresh()->getAttributes(), $staff->fresh()->getAttributes()]);
                $a['classBatch']->update(['teacher_id' => null]);
                $otherTeacher = Teacher::create(['user_id' => $a['admin']->id, 'employee_id' => 'ACADEMIC-OTHER', 'status' => 'active']);
                $a['assignment']->update(['teacher_id' => $otherTeacher->id]);
                $this->assertCount(0, $service->ownBatches($a['user'], $a['department']->id));
            });
            $this->api('GET', $this->hostOf($a['i']), 'teacher/batches', $a['user'])->assertForbidden();
        }
    }

    public function test_academic_predicate_rechecks_duty_membership_account_and_profile_without_caches(): void
    {
        extract($this->academicFixture('academic-revocation')); $this->bindTenant($i);
        $service = app(\App\Services\DepartmentAcademicReadService::class);
        $denied = function () use ($service, $user, $department) {
            try { $service->ownBatches($user, $department->id); $this->fail('Academic access must fail closed'); }
            catch (\App\Exceptions\BusinessException $e) { $this->assertSame(403, $e->status); }
        };
        $grant = DepartmentDutyAssignment::sole();
        foreach ([[$grant, 'status', 'revoked'], [$duty, 'status', 'archived'], [$duty, 'permission_keys', ['staff.batch.index']],
            [$membership, 'status', 'inactive'], [$department, 'status', 'archived'], [$user, 'is_active', false],
            [$user, 'role', 'teacher'], [$user, 'locked_until', now()->addHour()], [$teacher, 'status', 'inactive']] as [$row, $field, $value]) {
            $before = $row->getAttribute($field); $this->assertCount(2, $service->ownBatches($user, $department->id));
            $row->forceFill([$field => $value])->save(); $denied();
            $row->forceFill([$field => $before])->save();
        }
        $membership->update(['starts_at' => today(), 'ends_at' => today()]);
        $this->assertCount(2, $service->ownBatches($user, $department->id));
        $membership->update(['starts_at' => today()->addDay(), 'ends_at' => null]); $denied();
        $membership->update(['starts_at' => null, 'ends_at' => today()->subDay()]); $denied();
        $membership->update(['starts_at' => null, 'ends_at' => null]);
        $classBatch->update(['teacher_id' => null]);
        $subjectBatch->update(['status' => 'completed']);
        $this->assertCount(0, $service->ownBatches($user, $department->id));
        $teacher->delete(); $denied();
    }

    public function test_academic_predicate_denies_missing_ambiguous_foreign_context_and_impersonation(): void
    {
        $a = $this->fixture('academic-no-profile'); $b = $this->academicFixture('academic-other');
        $service = app(\App\Services\DepartmentAcademicReadService::class);
        $denied = function ($actor, $departmentId) use ($service) {
            try { $service->ownBatches($actor, $departmentId); $this->fail('Invalid academic context accepted'); }
            catch (\App\Exceptions\BusinessException $e) { $this->assertSame(403, $e->status); }
        };
        $denied($b['user'], $b['department']->id);
        Tenancy::as($a['i'], function () use ($a, $b, $service, $denied) {
            $a['duty']->update(['permission_keys' => ['staff.batch.mine']]);
            $denied($a['user'], $a['department']->id);
            $this->assertSame(0, Teacher::count()); $this->assertSame(0, StaffMember::count());
            $denied($b['user'], $a['department']->id); $denied($a['user'], $b['department']->id);
            $denied($a['admin'], $a['department']->id);
            Tenancy::withoutTenancy(fn () => $denied($a['user'], $a['department']->id));
            Teacher::create(['user_id' => $a['user']->id, 'employee_id' => 'ACADEMIC-REAL', 'status' => 'active']);
            $this->assertCount(0, $service->ownBatches($a['user'], $a['department']->id));
            $actor = $a['user']->fresh()->withAccessToken($a['user']->createToken('support', ['impersonated'])->accessToken);
            $denied($actor, $a['department']->id);
            Teacher::create(['user_id' => $a['user']->id, 'employee_id' => 'ACADEMIC-DUPLICATE', 'status' => 'active'])->delete();
            $denied($a['user'], $a['department']->id);
        });
    }

    public function test_http_context_is_own_metadata_across_four_types_and_foreign_ids_are_404(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            extract($this->fixture('http-context-'.$type, $type));
            $foreign = $this->fixture('http-foreign-'.$type, $type);
            $unassigned = Tenancy::as($i, fn () => app(DepartmentService::class)->create($admin, ['name' => 'Unassigned private']));
            $host = $this->hostOf($i);
            $expected = ['id' => $department->id, 'code' => $department->code, 'name' => 'Office', 'membership_id' => $membership->id];
            $this->api('GET', $host, 'staff/departments', $user)->assertOk()->assertJsonPath('success', true)
                ->assertJsonPath('data', [$expected])->assertJsonPath('meta.total', 1);
            $this->api('GET', $host, "staff/departments/{$department->id}/portal", $user)->assertOk()
                ->assertExactJson(['success' => true, 'data' => $expected]);
            $this->api('HEAD', $host, 'staff/departments', $user)->assertOk();
            $this->api('HEAD', $host, "staff/departments/{$department->id}/portal", $user)->assertOk();
            foreach ([$foreign['department']->id, $unassigned->id, 999999] as $id) {
                $this->api('GET', $host, "staff/departments/{$id}/portal", $user)->assertNotFound();
            }
            $this->api('GET', $host, 'staff/departments', $foreign['user'])->assertForbidden();
            $this->api('GET', $host, 'staff/departments')->assertUnauthorized();
            $this->api('GET', $host, 'staff/departments', $admin)->assertForbidden();
            $this->api('GET', $host, 'accountant/reports/dues', $user)->assertForbidden();
        }
    }

    public function test_http_context_pagination_empty_state_and_input_allowlist(): void
    {
        extract($this->fixture('http-context-pages')); $host = $this->hostOf($i);
        $second = Tenancy::as($i, function () use ($admin, $user) {
            $service = app(DepartmentService::class);
            $department = $service->create($admin, ['name' => 'Second']);
            $service->addMember($admin, $department->id, ['user_id' => $user->id]);
            return $department;
        });
        $this->api('GET', $host, 'staff/departments?per_page=1&page=2', $user)->assertOk()
            ->assertJsonPath('meta.total', 2)->assertJsonPath('meta.current_page', 2)->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $second->id);
        $this->api('GET', $host, 'staff/departments?per_page=1&page=3', $user)->assertOk()->assertJsonPath('data', []);
        foreach (['per_page=101', 'page=0', 'per_page[]=1', 'user_id=1', 'institution_id=1', 'department_id=1', 'permission_keys[]=*'] as $query) {
            $this->api('GET', $host, 'staff/departments?'.$query, $user)->assertUnprocessable();
        }
        $this->api('GET', $host, "staff/departments/{$department->id}/portal?user_id=1", $user)->assertUnprocessable();
        $this->api('GET', $host, 'staff/departments', $user, ['role' => 'admin'])->assertUnprocessable();
        Tenancy::as($i, fn () => \App\Models\DepartmentMembership::where('user_id', $user->id)->update(['status' => 'inactive']));
        $this->api('GET', $host, 'staff/departments', $user)->assertOk()->assertJsonPath('data', [])->assertJsonPath('meta.total', 0);
    }

    public function test_http_context_rechecks_dates_archive_and_identity_on_every_request(): void
    {
        extract($this->fixture('http-context-revoke')); $host = $this->hostOf($i); $path = "staff/departments/{$department->id}/portal";
        foreach ([['active', null, null, 'active', true], ['active', today(), today(), 'active', true],
            ['active', today()->addDay(), null, 'active', false], ['active', null, today()->subDay(), 'active', false],
            ['inactive', null, null, 'active', false], ['active', null, null, 'archived', false]] as [$status, $start, $end, $deptStatus, $allowed]) {
            Tenancy::as($i, function () use ($membership, $department, $status, $start, $end, $deptStatus) {
                $membership->update(['status' => $status, 'starts_at' => $start, 'ends_at' => $end]);
                $department->update(['status' => $deptStatus]);
            });
            $this->api('GET', $host, 'staff/departments', $user)->assertOk()->assertJsonPath('meta.total', $allowed ? 1 : 0);
            $this->api('GET', $host, $path, $user)->assertStatus($allowed ? 200 : 404);
        }
        Tenancy::as($i, fn () => $department->update(['status' => 'active']));
        $user->forceFill(['locked_until' => now()->addHour()])->save();
        $this->api('GET', $host, 'staff/departments', $user)->assertForbidden();
        $user->forceFill(['locked_until' => null])->save();
        Tenancy::as($i, function () use ($user) {
            Teacher::create(['user_id' => $user->id, 'employee_id' => 'HTTP-T1']);
            Teacher::create(['user_id' => $user->id, 'employee_id' => 'HTTP-T2'])->delete();
        });
        $this->api('GET', $host, $path, $user)->assertForbidden();
        $this->api('GET', $host, 'staff/departments', $user)->assertForbidden();
    }

    public function test_own_context_is_minimal_read_only_metadata_across_four_types(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            extract($this->fixture('context-'.$type, $type));
            Tenancy::as($i, function () use ($user, $admin, $department, $membership) {
                $service = app(\App\Services\DepartmentContextService::class);
                $other = app(DepartmentService::class)->create($admin, ['name' => 'Private unassigned']);
                $teacher = Teacher::create(['user_id' => $user->id, 'employee_id' => 'CONTEXT-T']);
                $staff = StaffMember::factory()->create(['user_id' => $user->id]);
                $before = [$user->fresh()->getAttributes(), $teacher->fresh()->getAttributes(), $staff->fresh()->getAttributes(), $membership->fresh()->getAttributes()];
                $expected = ['id' => $department->id, 'code' => $department->code, 'name' => 'Office', 'membership_id' => $membership->id];
                $this->assertSame([$expected], $service->index($user)->all());
                $this->assertSame($expected, $service->show($user, $department->id));
                try { $service->show($user, $other->id); $this->fail('Unassigned context exposed'); }
                catch (\Illuminate\Database\Eloquent\ModelNotFoundException) { $this->assertTrue(true); }
                $this->assertSame($before, [$user->fresh()->getAttributes(), $teacher->fresh()->getAttributes(), $staff->fresh()->getAttributes(), $membership->fresh()->getAttributes()]);
            });
            $this->api('GET', $this->hostOf($i), 'programs', $user)->assertForbidden();
        }
    }

    public function test_context_membership_dates_and_department_archive_are_fresh(): void
    {
        extract($this->fixture('context-dates')); $this->bindTenant($i);
        $service = app(\App\Services\DepartmentContextService::class);
        foreach ([['active', null, null, 'active', true], ['active', today(), today(), 'active', true],
            ['active', today()->addDay(), null, 'active', false], ['active', null, today()->subDay(), 'active', false],
            ['inactive', null, null, 'active', false], ['active', null, null, 'archived', false]] as [$status, $start, $end, $deptStatus, $allowed]) {
            $membership->update(['status' => $status, 'starts_at' => $start, 'ends_at' => $end]);
            $department->update(['status' => $deptStatus]);
            $this->assertSame($allowed ? 1 : 0, $service->index($user)->count());
            if ($allowed) $this->assertSame($department->id, $service->show($user, $department->id)['id']);
            else {
                try { $service->show($user, $department->id); $this->fail('Ineffective context exposed'); }
                catch (\Illuminate\Database\Eloquent\ModelNotFoundException) { $this->assertTrue(true); }
            }
        }
    }

    public function test_context_rejects_foreign_inactive_ambiguous_and_impersonated_identity(): void
    {
        $a = $this->fixture('context-a'); $b = $this->fixture('context-b');
        $service = app(\App\Services\DepartmentContextService::class);
        $denied = function ($actor) use ($service, $a) {
            foreach ([fn () => $service->index($actor), fn () => $service->show($actor, $a['department']->id)] as $read) {
                try { $read(); $this->fail('Invalid identity accepted'); }
                catch (\App\Exceptions\BusinessException $e) { $this->assertSame(403, $e->status); }
            }
        };
        $denied($a['user']);
        Tenancy::as($a['i'], function () use ($a, $b, $service, $denied) {
            $denied($b['user']); $denied($a['admin']);
            Tenancy::withoutTenancy(fn () => $denied($a['user']));
            try { $service->show($a['user'], $b['department']->id); $this->fail('Foreign context exposed'); }
            catch (\Illuminate\Database\Eloquent\ModelNotFoundException) { $this->assertTrue(true); }
            foreach ([[$a['user'], 'is_active', false], [$a['user'], 'role', 'teacher'], [$a['user'], 'locked_until', now()->addHour()], [$a['i'], 'status', 'inactive']] as [$row, $field, $value]) {
                $before = $row->getAttribute($field); $row->forceFill([$field => $value])->save();
                $denied($a['user']); $row->forceFill([$field => $before])->save();
                $this->assertCount(1, $service->index($a['user']));
            }
            $actor = $a['user']->fresh()->withAccessToken($a['user']->createToken('support', ['impersonated'])->accessToken);
            $denied($actor);
            StaffMember::factory()->create(['user_id' => $a['user']->id]);
            $duplicate = StaffMember::factory()->create(['user_id' => $a['user']->id]);
            $denied($a['user']); $duplicate->delete(); $denied($a['user']);
        });
    }

    public function test_exact_duty_prerequisite_across_four_types_never_opens_a_business_route(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            extract($this->fixture('prereq-'.$type, $type));
            $check = app(DepartmentDutyPermissionService::class);
            Tenancy::as($i, function () use ($check, $user, $department, $admin) {
                $this->assertTrue($check->has($user, $department->id, 'staff.report.dues'));
                foreach (['*', 'staff.*', 'staff.report', 'staff.report.dues ', 'staff.report.fees', 'principal.approve'] as $key) $this->assertFalse($check->has($user, $department->id, $key));
                $this->assertFalse($check->has($admin, $department->id, 'staff.report.dues'));
                $this->assertSame(0, Teacher::count()); $this->assertSame(0, StaffMember::count());
            });
            $this->api('GET', $this->hostOf($i), 'accountant/reports/dues', $user)->assertForbidden();
            $this->api('GET', $this->hostOf($i), 'programs', $user)->assertForbidden();
            $this->assertSame('institution_staff', $user->fresh()->role);
        }
    }

    public function test_every_revoked_or_inactive_prerequisite_is_rechecked_in_the_same_process(): void
    {
        extract($this->fixture()); $this->bindTenant($i); $check = app(DepartmentDutyPermissionService::class);
        $assignment = DepartmentDutyAssignment::sole();
        foreach ([[$assignment, 'status', 'revoked'], [$duty, 'status', 'archived'], [$membership, 'status', 'inactive'],
            [$department, 'status', 'archived'], [$user, 'is_active', false], [$user, 'role', 'teacher'], [$user, 'locked_until', now()->addHour()], [$i, 'status', 'inactive']] as [$row, $field, $denied]) {
            $before = $row->getAttribute($field);
            $this->assertTrue($check->has($user, $department->id, 'staff.report.dues'));
            $row->forceFill([$field => $denied])->save();
            $this->assertFalse($check->has($user, $department->id, 'staff.report.dues'), $row::class.'.'.$field);
            $row->forceFill([$field => $before])->save();
        }
        $membership->update(['starts_at' => today()->toDateString(), 'ends_at' => today()->toDateString()]);
        $this->assertTrue($check->has($user, $department->id, 'staff.report.dues'));
        $membership->update(['starts_at' => today()->addDay()->toDateString(), 'ends_at' => null]);
        $this->assertFalse($check->has($user, $department->id, 'staff.report.dues'));
        $membership->update(['starts_at' => null, 'ends_at' => today()->subDay()->toDateString()]);
        $this->assertFalse($check->has($user, $department->id, 'staff.report.dues'));
    }

    public function test_foreign_context_missing_membership_mismatched_department_and_impersonation_fail_closed(): void
    {
        $a = $this->fixture('prereq-a'); $b = $this->fixture('prereq-b'); $check = app(DepartmentDutyPermissionService::class);
        $this->assertFalse($check->has($a['user'], $a['department']->id, 'staff.report.dues'));
        Tenancy::as($a['i'], function () use ($a, $b, $check) {
            $this->assertFalse($check->has($b['user'], $a['department']->id, 'staff.report.dues'));
            $this->assertFalse($check->has($a['user'], $b['department']->id, 'staff.report.dues'));
            $this->assertFalse(Tenancy::withoutTenancy(fn () => $check->has($a['user'], $a['department']->id, 'staff.report.dues')));
            $other = app(DepartmentService::class)->create($a['admin'], ['name' => 'Unassigned']);
            $this->assertFalse($check->has($a['user'], $other->id, 'staff.report.dues'));
            // Legal tenant FKs, intentionally wrong department: service must still refuse it.
            $wrongDuty = DepartmentDuty::factory()->create(['department_id' => $other->id, 'permission_keys' => ['staff.report.dues']]);
            DepartmentDutyAssignment::sole()->update(['duty_id' => $wrongDuty->id]);
            $this->assertFalse($check->has($a['user'], $a['department']->id, 'staff.report.dues'));
            DepartmentDutyAssignment::sole()->update(['duty_id' => $a['duty']->id]);
            $actor = $a['user']->fresh()->withAccessToken($a['user']->createToken('support', ['impersonated'])->accessToken);
            $this->assertFalse($check->has($actor, $a['department']->id, 'staff.report.dues'));
        });
    }

    public function test_malformed_stored_keys_never_become_executable_permissions(): void
    {
        extract($this->fixture()); $this->bindTenant($i); $check = app(DepartmentDutyPermissionService::class);
        foreach ([['*'], ['staff.report.dues', '*'], ['staff.report.dues', 'staff.report.dues'], ['key' => 'staff.report.dues'], [1], [], 'staff.report.dues'] as $keys) {
            $duty->update(['permission_keys' => $keys]);
            $this->assertFalse($check->has($user, $department->id, 'staff.report.dues'));
        }
        $duty->update(['permission_keys' => ['staff.report.dues']]);
        $this->assertTrue($check->has($user, $department->id, 'staff.report.dues'));
    }

    public function test_one_teacher_and_one_staff_profile_is_valid_but_ambiguous_links_need_review(): void
    {
        extract($this->fixture()); $this->bindTenant($i); $check = app(DepartmentDutyPermissionService::class);
        $teacher = Teacher::create(['user_id' => $user->id, 'employee_id' => 'AUTH-T', 'designation' => 'Historical teacher']);
        $staff = StaffMember::factory()->create(['user_id' => $user->id, 'employee_id' => 'AUTH-S', 'designation' => 'Historical staff']);
        $before = [$teacher->fresh()->getAttributes(), $staff->fresh()->getAttributes(), $user->fresh()->getAttributes()];
        $this->assertTrue($check->has($user, $department->id, 'staff.report.dues'));
        $duplicate = Teacher::create(['user_id' => $user->id, 'employee_id' => 'AUTH-T2']);
        $this->assertFalse($check->has($user, $department->id, 'staff.report.dues'));
        $duplicate->delete();
        $this->assertFalse($check->has($user, $department->id, 'staff.report.dues'), 'Soft deletion is not a reviewed identity reconciliation');
        $this->assertSame($before, [$teacher->fresh()->getAttributes(), $staff->fresh()->getAttributes(), $user->fresh()->getAttributes()]);
    }
}

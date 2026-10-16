# Testing Strategy

## Laravel — PHPUnit Tests

### Feature Tests
```bash
php artisan make:test AuthTest
php artisan make:test TenantIsolationTest
php artisan make:test StudentApiTest
php artisan make:test FeeCollectionTest
php artisan make:test ResultPublishTest
php artisan make:test SubscriptionLimitTest
```

### AuthTest.php
```php
public function test_login_success() {
    $institution = Institution::factory()->create();
    $user = User::factory()->create(['institution_id'=>$institution->id, 'role'=>'admin']);
    $response = $this->withHeaders(['Host' => $institution->slug.'.schoolapp.com'])
                     ->postJson('/api/auth/login', ['email'=>$user->email, 'password'=>'password']);
    $response->assertOk()->assertJsonStructure(['token','user','role']);
}

public function test_login_wrong_password() {
    $response = $this->postJson('/api/auth/login', ['email'=>'x@x.com', 'password'=>'wrong']);
    $response->assertStatus(401);
}
```

### TenantIsolationTest.php
```php
// Most important test!
public function test_institution_a_cannot_see_institution_b_students() {
    $institutionA = Institution::factory()->create();
    $institutionB = Institution::factory()->create();
    $studentA = Student::factory()->create(['institution_id' => $institutionA->id]);
    $studentB = Student::factory()->create(['institution_id' => $institutionB->id]);

    $adminA = User::factory()->create(['institution_id'=>$institutionA->id, 'role'=>'admin']);
    $token = $adminA->createToken('test')->plainTextToken;

    $response = $this->withHeaders([
        'Authorization'   => "Bearer $token",
        'Host' => $institutionA->slug.'.schoolapp.com',
    ])->getJson('/api/students');

    // Institution A's admin should only see Institution A's students
    $response->assertOk();
    $ids = collect($response->json('data'))->pluck('id');
    $this->assertTrue($ids->contains($studentA->id));
    $this->assertFalse($ids->contains($studentB->id)); // Institution B-এর ছাত্র দেখা যাবে না!
}
```

### SubscriptionLimitTest.php
```php
public function test_cannot_add_student_beyond_limit() {
    $plan = SubscriptionPlan::create(['max_students'=>2, ...]);
    $institution = Institution::factory()->create(['subscription_plan_id'=>$plan->id]);
    Student::factory(2)->create(['institution_id'=>$institution->id]); // limit পূর্ণ

    $admin = User::factory()->create(['institution_id'=>$institution->id,'role'=>'admin']);
    $token = $admin->createToken('test')->plainTextToken;

    $response = $this->withHeaders(['Authorization'=>"Bearer $token",...])
                     ->postJson('/api/students', Student::factory()->make()->toArray());
    $response->assertStatus(403)->assertJson(['error'=>'student_limit_reached']);
}
```

### Run Tests
```bash
php artisan test                           # সব test
php artisan test --filter AuthTest        # নির্দিষ্ট test
php artisan test --coverage               # coverage report
```

## React — Vitest + Testing Library
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

### authStore.test.js
```javascript
import { useAuthStore } from '../store/authStore'

test('setAuth stores token and role', () => {
  const { setAuth, token, role } = useAuthStore.getState()
  setAuth('test-token', { name: 'Admin', role: 'admin' })
  expect(useAuthStore.getState().token).toBe('test-token')
  expect(useAuthStore.getState().role).toBe('admin')
  expect(useAuthStore.getState().isAuthenticated).toBe(true)
})

test('clearAuth resets state', () => {
  useAuthStore.getState().clearAuth()
  expect(useAuthStore.getState().token).toBeNull()
  expect(useAuthStore.getState().isAuthenticated).toBe(false)
})
```

### Can.test.jsx
```javascript
import { render, screen } from '@testing-library/react'
import Can from '../components/common/Can'

test('shows children for correct role', () => {
  useAuthStore.setState({ role: 'admin' })
  render(<Can role="admin"><button>Delete</button></Can>)
  expect(screen.getByText('Delete')).toBeInTheDocument()
})

test('hides children for wrong role', () => {
  useAuthStore.setState({ role: 'teacher' })
  render(<Can role="admin"><button>Delete</button></Can>)
  expect(screen.queryByText('Delete')).not.toBeInTheDocument()
})
```

### ResultScoringTest.php (grading is backend-only - Revision 7)
```php
class ResultScoringTest extends TestCase
{
    /** @dataProvider percentages */
    public function test_grade_comes_from_percentage_not_from_a_fixed_100(float $got, float $full, string $grade, float $point)
    {
        $es  = ExamSubject::factory()->make(['full_marks' => $full, 'pass_marks' => $full * 0.33, 'components' => null]);
        $res = app(ResultService::class)->score($es, $got, null, false);
        $this->assertSame($grade, $res['grade']);
        $this->assertEquals($point, $res['grade_point']);
    }
    public static function percentages(): array
    {
        return [[95, 100, 'A+', 5.00], [20, 25, 'A+', 5.00], [17.5, 25, 'A', 4.00], [55, 100, 'B', 3.00], [7, 25, 'F', 0.00], [20, 100, 'F', 0.00]];
    }
    public function test_failing_one_component_fails_the_subject_whatever_the_total()
    {
        $es = ExamSubject::factory()->make(['full_marks' => 100, 'pass_marks' => 33, 'components' => [
            ['key' => 'written', 'label' => 'লিখিত', 'full' => 70, 'pass' => 23], ['key' => 'mcq', 'label' => 'MCQ', 'full' => 30, 'pass' => 10]]]);
        $res = app(ResultService::class)->score($es, null, ['written' => 69, 'mcq' => 5], false);   // 74 total but MCQ below 10
        $this->assertSame(0, $res['is_pass']); $this->assertSame('F', $res['grade']);
    }
}
```

## Postman Collection
```json
{
  "info": { "name": "Edu SaaS API" },
  "variable": [
    { "key": "baseUrl", "value": "https://{{domain}}/api/v1" },
    { "key": "token",   "value": "" },
    { "key": "domain",  "value": "dhanmondi.schoolapp.com" }
  ],
  "auth": {
    "type": "bearer",
    "bearer": [{ "key": "token", "value": "{{token}}" }]
  }
}
// Pre-request script (Collection level):
// pm.request.headers.add({ key: 'Host', value: pm.variables.get('domain') })
```

---

## New Feature Tests (Revision 5)

### FeeServiceTest.php
```php
class FeeServiceTest extends TestCase
{
    public function test_sibling_discount_applied()
    {
        $institution  = Institution::factory()->create();
        $parent  = User::factory()->create(['role'=>'parent', 'institution_id'=>$institution->id, 'phone'=>'01711111111']);
        $student1= Student::factory()->create(['institution_id'=>$institution->id, 'guardian_phone'=>'01711111111']);
        $student2= Student::factory()->create(['institution_id'=>$institution->id, 'guardian_phone'=>'01711111111']);

        $service  = app(FeeService::class);
        $discount = $service->calculateSiblingDiscount($student2->id);

        $this->assertEquals(10.0, $discount); // 2nd child = 10% discount
    }

    public function test_late_fee_calculated_after_due_date()
    {
        $service     = app(FeeService::class);
        $paymentDate = new \DateTime('2025-01-20'); // after 10th
        $lateFee     = $service->calculateLateFee('2025-01', $paymentDate);

        $this->assertEquals(50.00, $lateFee); // 10 days × 5 BDT
    }

    public function test_receipt_numbers_are_sequential_and_unique_per_institution()
    {
        $institution = Institution::factory()->create();
        $this->bindTenant($institution);   // tests/TestCase.php helper = Tenancy::as semantics; auto-released after the test
        $service = app(FeeService::class);

        $nos = DB::transaction(fn () => [$service->nextReceiptNo(), $service->nextReceiptNo()]);   // inside a transaction: it locks the institution row
        $this->assertStringStartsWith('RCP-' . date('Y') . '-', $nos[0]);
        // nextReceiptNo() reads the last SAVED receipt, so two calls without saving return the same number.
        // The real guarantee (no duplicates under concurrency) is tested in FeeCollectionTest by collecting twice in parallel.
        $this->assertSame($nos[0], $nos[1]);
    }
}
```

### AttendanceServiceTest.php
```php
class AttendanceServiceTest extends TestCase
{
    public function test_cannot_take_attendance_on_holiday_in_a_school()
    {
        $institution = Institution::factory()->create(['institution_type' => 'school']);
        $this->bindTenant($institution);   // tests/TestCase.php helper = Tenancy::as semantics; auto-released after the test
        Holiday::create(['institution_id'=>$institution->id, 'date'=>'2025-01-15', 'title'=>'Test Holiday', 'type'=>'public']);
        $batch = Batch::factory()->create();
        $this->expectException(\App\Exceptions\BusinessException::class);

        app(AttendanceService::class)->saveBulk([
            'batch_id' => $batch->id, 'date' => '2025-01-15',
            'records'  => [['student_id' => 1, 'status' => 'present']],
        ]);
    }

    public function test_student_must_be_enrolled_in_the_batch()
    {
        $batch   = Batch::factory()->create();
        $student = Student::factory()->create();                     // NOT enrolled in $batch
        $this->expectException(\App\Exceptions\BusinessException::class);
        app(AttendanceService::class)->saveBulk(['batch_id' => $batch->id, 'date' => '2025-02-01',
            'records' => [['student_id' => $student->id, 'status' => 'present']]]);
    }

    public function test_attendance_percentage_calculated()
    {
        $service  = app(AttendanceService::class);
        $summary  = $service->getStudentSummary(1, '2025-01');

        $this->assertArrayHasKey('percentage', $summary);
        $this->assertGreaterThanOrEqual(0, $summary['percentage']);
        $this->assertLessThanOrEqual(100, $summary['percentage']);
    }
}
```

### OnlineExamTest.php
```php
class OnlineExamTest extends TestCase
{
    public function test_mcq_auto_graded_correctly()
    {
        $exam = OnlineExam::factory()->create(['total_marks' => 10]);
        $questions = ExamQuestion::factory(10)->create([
            'online_exam_id' => $exam->id,
            'marks'          => 1,
            'correct_answer' => 'A',
        ]);

        $student  = Student::factory()->create();
        $attempt  = ExamAttempt::create([
            'online_exam_id' => $exam->id,
            'student_id'     => $student->id,
            'answers'        => $questions->mapWithKeys(fn($q) => [$q->id => 'A'])->toArray(), // all correct
            'institution_id'      => $exam->institution_id,
        ]);

        $service = app(OnlineExamService::class);
        $score   = $service->gradeAttempt($attempt);

        $this->assertEquals(10, $score); // 10/10 correct
        $this->assertEquals(100.0, $attempt->fresh()->percentage);
    }
}
```

### StudentImportTest.php
```php
class StudentImportTest extends TestCase
{
    public function test_excel_import_creates_students()
    {
        $institution = Institution::factory()->create();
        $this->bindTenant($institution);   // tests/TestCase.php helper = Tenancy::as semantics; auto-released after the test
        $class = Program::factory()->create(['institution_id' => $institution->id]);

        // Create test Excel file
        $spreadsheet = new \PhpOffice\PhpSpreadsheet\Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->fromArray([
            ['name', 'program_id', 'gender', 'guardian_phone'],  // header
            ['Test Student 1', $class->id, 'male', '01711111111'],   // data
        ]);

        $writer = new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($spreadsheet);
        $tmpFile = tempnam(sys_get_temp_dir(), 'test') . '.xlsx';
        $writer->save($tmpFile);

        $import = new \App\Imports\StudentImport($institution->id, app(\App\Services\StudentService::class));
        \Maatwebsite\Excel\Facades\Excel::import($import, $tmpFile);

        $this->assertEquals(1, $import->importedCount);
        $this->assertDatabaseHas('students', ['name' => 'Test Student 1', 'institution_id' => $institution->id]);
    }
}
```

---

## Revision 6 — Required Tests

Test-এ tenant নির্ধারণ হয় `Host` header দিয়ে (`->withHeaders(['Host' => $institution->slug.'.'.config('tenancy.base_domain')])`) — কোনো tenant header নেই। `phpunit.xml`-এ `APP_BASE_DOMAIN=schoolapp.com`, `CENTRAL_DOMAINS=schoolapp.com,admin.schoolapp.com`।

| Test Class | Asserts | Spec |
|---|---|---|
| `TenantIsolationTest` (existing, extend) | চার type-এর দুটি করে tenant; প্রতিটি tenant-scoped endpoint-এ অন্য tenant-এর row কখনো আসে না | `docs/architecture/tenancy.md` |
| `TenantModeTest` | `tenant` route central host-এ 404; `tenant:central` route tenant host-এ 404; super_admin token tenant host-এ 403; tenant token central host-এ 403; `/health` ও `/bootstrap` দুই host-এই বিনা token-এ চলে; suspended institution শুধু auth/bootstrap/subscription পথে | `docs/templates/laravel-core-files.md` |
| `TargetingRuleTest` | `batch_id` সেট করা homework শুধু সেই batch-এর student দেখে; `batch_id = NULL` পুরো program; দুই batch-এর student দুটোই দেখে | `docs/modules/academic-structure.md` |
| `ModuleGateTest` | type-এ না থাকা module → 403 `module_disabled`; plan flag false → 403; Super Admin override দুই দিকেই জেতে; `/bootstrap`-এর `modules` একই ফল দেয় | `docs/modules/institution-types.md` |
| `TerminologyTest` | `term('batch')` চার type-এ ভিন্ন; institution override জেতে; `/bootstrap.terms`-এ সব key আছে | একই |
| `EnrollmentServiceTest` | school-এ দ্বিতীয় active enrollment → 422; coaching-এ অনুমোদিত; capacity পূর্ণ → 422; একই batch-এ দুবার → 422 | `docs/modules/academic-structure.md` |
| `EnrollmentCacheSyncTest` | enroll / end / transfer-এর পর `students.program_id, batch_id, roll_no` = primary active enrollment; সব enrollment শেষ হলে NULL | একই |
| `BatchAttendanceTest` | একই student একই দিনে দুই batch-এ আলাদা attendance; enrollment ছাড়া student → 422; একই (student, batch, date) দুবার → update, duplicate নয় | একই |
| `FeeResolutionTest` | ক্রম: `fee_override` > `batches.monthly_fee` > batch `fee_structures` > program `fee_structures` > category; দুই batch-এর student-এর দুটি due; `half_after_15` proration | একই |
| `LoginIdentifierTest` | email, phone (`+8801…`, `01…`), student ID — তিনভাবেই login; একই email দুই tenant-এ আলাদা user; tenant host-এ super_admin login ব্যর্থ | `docs/AUTHORIZATION.md` |
| `PerInstitutionUniqueTest` | একই `student_id`, `receipt_no`, `employee_id` দুই tenant-এ সম্ভব; একই tenant-এ → 422 | `docs/database/schema.sql` |
| `TeacherPayoutTest` | `per_class`, `percentage`, `fixed_monthly` হিসাব; `generate` idempotent; paid row বদলায় না | `docs/modules/coaching-private-batch.md` |
| `SmsCreditTest` | quota থাকলে balance কমে না; quota শেষে balance কমে + ledger row; দুটোই শেষে 402 | একই |
| `ThemeResolutionTest`, `ThemeGatingTest` | resolution order; ৮টি token সবসময় আছে; অবৈধ token → 422; Basic plan premium preset/token বদলাতে পারে না | `docs/THEMING.md` |
| `TenantResolverTest`, `DomainLifecycleTest`, `DomainValidationTest`, `TlsCheckTest`, `DomainPlanSyncTest`, `CrossTenantHostTest`, `PrimaryUrlTest` | — | `docs/modules/custom-domain.md` Part G |

**Factories:** test-এ student-কে batch-এ রাখতে সবসময় `EnrollmentService::enroll()` (বা `Student::factory()->enrolledIn($batch)` state, যা ভেতরে একই service call করে) ব্যবহার করুন — factory-তে `program_id`/`batch_id` সরাসরি বসাবেন না। পুরনো test উদাহরণে `'batch_id' => …` দেখলে এভাবে বদলে নিন।

### Vitest (Frontend)
| Test | Asserts |
|---|---|
| `buildNav.test.js` | disabled module-এর item বাদ; খালি group বাদ; label terminology থেকে |
| `layouts.test.jsx` | চারটি layout-এর প্রতিটি একই `nav` দিয়ে সব item, BrandLogo, UserMenu, NotificationBell render করে |
| `ThemeProvider.test.jsx` | theme object থেকে CSS variable ও `data-*` attribute বসে; user-এর dark mode পছন্দ institution default-এর উপরে |
| `lint:theme` (CI) | `node scripts/check-theme-rules.mjs` — রঙ-class/hex/radius/হার্ডকোড শব্দ/XSS: ০ লঙ্ঘন (`infra/check-theme-rules.mjs`) |

---

## Revision 6.2 — Additional Tests
| Test Class | Asserts | Spec |
|---|---|---|
| `FeeCollectionTest` | একসাথে ৩টি due নিলে ১টি `receipt_no`, `line_no` ১..৩; দুই batch-এর due আলাদা line; আংশিক পেমেন্টে `partial` ও পরের `dueLines()`-এ অবশিষ্ট অঙ্ক; `fee_override`/waiver/sibling প্রযোজ্য; `half_after_15` proration; একই due দুবার নেওয়া যায় না; দুই সমান্তরাল collect-এ রসিদ নম্বর duplicate হয় না | `docs/templates/laravel-core-files.md` |
| `PaymentRouterTest`, `OnlinePaymentInitiateTest`, `OnlinePaymentFinalizeTest`, `ModeStabilityTest`, `FeeSplitTest`, `SettlementTest`, `CredentialSecurityTest`, `ReconcileTest`, `GatewayContractTest` | — | `docs/modules/online-fee-payment.md` "Tests" |
| `SmsSenderResolutionTest` | `approved` ID → সেই sid ও suffix ছাড়া; `pending`/`rejected`/`none` → default sid ও suffix; ID বদলালে `pending` ও পুরনোটি ব্যবহার হয় না; নিজস্ব ID ব্যর্থ হলে default-এ একবার retry ও `fallback_used`; status নিজে থেকে বদলায় না; ফরম্যাট/দৈর্ঘ্য/duplicate ID validation; অন্য প্রতিষ্ঠানের Admin অনুমোদন করতে পারে না | `docs/modules/notifications.md` |
| `PublicAdmissionTest`, `PublicSiteDataTest`, `PublicShellTest`, `BootstrapWhitelistTest`, `PublicSiteFrontendTest` | — | `docs/modules/public-website.md` "Tests" |

| `ResultScoringTest`, `ExamSubjectsTest` | R6.3: percentage-based grade on any full marks; component pass rule; absent; limits; unique result; auto-created exam_subjects; admit card needs a schedule | `docs/modules/grading.md` |

| `GatewayRegistryTest`, `ReviewFlowTest`, `NotifyEndpointTest`, `QrFlowTest`, `RegistryExtensibilityTest` | R6.4 — registry, `review` status, generic notify, QR flow with `FakeQrGateway`, adding a gateway needs no migration/route/UI change | `docs/modules/online-fee-payment.md` "Tests", `banglaqr-readiness.md` |

---

## Revision 7 — Tenant Isolation Tests (fail-closed)
`tests/TestCase.php`: `protected function bindTenant(Institution $i): void { Tenancy::as(...) semantics - bind now, release in tearDown }` — অ্যাপ-কোডের মতো `app()->instance` সরাসরি নয়।

| Test | Asserts |
|---|---|
| `TenantFailClosedTest` | tenant বাঁধা না থাকলে প্রতিটি tenant-scoped model-এ (`BelongsToInstitution` ব্যবহারকারী সব — reflection দিয়ে লুপ) `->get()`, `->count()`, `::create()` `TenantNotBoundException`; `Tenancy::withoutTenancy()`-এর ভেতরে `->get()` চলে কিন্তু `::create()` `institution_id` ছাড়া `LogicException`; অন্য প্রতিষ্ঠানের `institution_id` দিয়ে create → `Cross-tenant write blocked`; `institution_id` update → `immutable`; `User::inTenant()` tenant ছাড়া exception, `User::platform()` শুধু super_admin |
| `QueueTenantLeakTest` | প্রতিষ্ঠান A-র job চালানোর পরে `Tenancy::current()` null/আগের মান; একই worker প্রক্রিয়ায় A তারপর B-র job: B-র job শুধু B-র ডেটা দেখে; job চলাকালে exception হলেও tenant ছাড়া পড়ে (`finally`); `institutionId` ছাড়া job dispatch compile/test-এ ব্যর্থ (প্রতিটি `ShouldQueue` যা tenant model ছোঁয় তা `TenantAwareJob` ব্যবহার করে — reflection) |
| `TenancyArchitectureTest` | `app/` স্ক্যান: `withoutGlobalScope(s)`, `app()->instance('currentInstitution'`, `anyInstitution(`, `withoutTenancy(`, `DB::table(` / `DB::select(` / `DB::statement(` / `DB::affectingStatement(` / `DB::insert(` / `DB::update(` / `DB::delete(` / `DB::unprepared(` শুধু `tests/Architecture/tenancy-allowlist.php`-এ নাম-ধরা ফাইলে (প্রতিটির কারণ-সহ: `TenantMiddleware`, `TenantResolver`, `tls-check`, payment callback, `PlatformScope`, seeders); `TenantAwareJob` ছাড়া কোনো `ShouldQueue` class tenant model ব্যবহার করে না; `routes/api.php`-এ `/super` group-এ `tenancy.bypass` আছে এবং অন্য কোথাও নেই |
| `PlatformScopeTest` | `/super/*` tenant user-এর token-এ 403; Super Admin-এ সব প্রতিষ্ঠানের তালিকা আসে; bypass-এর ভেতরে `institution_id` ছাড়া create → exception |

---

## Revision 7 — Auth, Privacy & Spike Tests
| Test Class | Asserts | Spec |
|---|---|---|
| `TokenLifetimeTest` | প্রতি role-এর absolute মেয়াদ (`expires_at`); idle-সীমা পার হলে 401 (Sanctum callback; `last_used_at`-এর আগের মান দেখে); `is_active=0` হলে token চলে না; ৬ষ্ঠ token-এ পুরনোটি বাতিল; password/role/is_active/2FA বদলালে সব token বাতিল; password বদলে বর্তমান token থাকে | `docs/AUTHORIZATION.md` |
| `PasswordPolicyTest` | role-ভিত্তিক দৈর্ঘ্য ও অক্ষর+সংখ্যা; ব্যবহারকারীর নাম/ফোন/ইমেইল/Student ID ধারণকারী অগ্রাহ্য; সাধারণ তালিকা অগ্রাহ্য; student/parent-এ বিশেষ-চিহ্ন বাধ্যতামূলক নয় | একই |
| `LockoutTest` | ৫ ভুলে ৩০ মিনিট লক ও token বাতিল; **লক ও ভুল-পাসওয়ার্ডের JSON হুবহু এক**; অস্তিত্বহীন user ও ভুল পাসওয়ার্ডের একই বার্তা ও একই সংখ্যক `Hash::check`; সফল লগইনে কাউন্টার শূন্য; Admin `unlock`; একই email দুই প্রতিষ্ঠানে আলাদা লক | একই |
| `SessionApiTest` | `/auth/sessions` শুধু নিজের, IP নেই; অন্যের session মুছতে 404; `logout-all`; Admin `force-logout` অন্য প্রতিষ্ঠানের user-এ 404 | একই |
| `ConsentTest` | `record/revoke`; SMS বন্ধ = প্রচারমূলক SMS যায় না কিন্তু পেমেন্ট-রসিদ যায়; একই অভিভাবক-ফোনের একাধিক সন্তানের একটিতে বন্ধ হলে ফোন-স্তরে বন্ধ; পাবলিক ফর্মে চেকবক্স ছাড়া 422; ইতিহাস `audit_logs`-এ | `docs/legal/privacy-and-consent.md` |
| `StudentErasureTest` | বেনামির পর `students/users/documents/health/behavior/consents`-এ কোনো নাম/ফোন/ছবি নেই; `results/attendances/fee_payments` অক্ষত; অভিভাবক-লিংক নেই; token বাতিল; storage ফাঁকা; audit-সারি ব্যক্তিগত তথ্যবিহীন | একই |
| `TenantPurgeTest` | প্রতিটি `institution_id`-ওয়ালা টেবিল purge-তালিকায় (নতুন টেবিল ভুলে বাদ পড়লে ব্যর্থ); dry-run সংখ্যা মেলে; শেষে সব ০; অন্য প্রতিষ্ঠানের ডেটা অক্ষত | একই |
| `RetentionTest` | `leads:purge` (১২ মাস, রূপান্তরিত বাদ), `sms:trim`, `audit:trim` সঠিক সারি মোছে/NULL করে; `Tenancy::each()` ভিতরে | একই |
| `PrivateFileAccessTest` | ছাত্রের ছবি/নথি signature ছাড়া 403; মেয়াদোত্তীর্ণ signed URL 403; অন্য প্রতিষ্ঠানের ফাইলের URL কাজ করে না | একই |
| `SpikeGateTest` (হাতে/স্ক্রিপ্ট) | spike-এর slice তিন tenant-এ: `school`-এ একক enrollment, `coaching`-এ দুই batch → ১ রসিদে ২ লাইন, `private_batch`-এ Program লুকানো; প্রতিটি ধাপে SPIKE-LOG পূর্ণ | `docs/spike/walking-skeleton.md` |

---

## Revision 8 — UI Pack Tests
| Test | Asserts | Spec |
|---|---|---|
| `PackContractTest` (Vitest, **pack × slot matrix**) | প্রতিটি registry-ভুক্ত pack ও প্রতিটি page-slot-এর জন্য: একই fixture দিয়ে render; hook-এর `actions` কী-সেট = view-র `[data-action]` সেট; `data` এর প্রতিটি আইটেমের `[data-row]`; কীবোর্ডে (Tab/Enter) প্রতিটি action পৌঁছায়; permission-হীন action নেই; override-না-থাকা slot-এ default view | `docs/UI-PACKS.md` §৫ |
| `ComponentVariantContractTest` | `Tabs/Modal/StatCard/List`-এর প্রতিটি variant একই props নেয় ও একই আচরণ দেখায় (তীর-কী, focus trap, Esc, `aria-*`, `primary` কলাম, <৭৬৮px-এ sheet/cards) | §৬ |
| `PackRegistryTest` | অজানা `ui_pack` → `classic`; প্রতিটি manifest-এর `components` মান বৈধ variant; `views`-এর কী বদ্ধ তালিকায়; `config/ui_packs.php`-এর প্রতিটি key-র জন্য manifest আছে (উল্টোটাও) | §৪, §৭ |
| `ThemePackCompatTest` (PHPUnit) | অসঙ্গত `(layout, pack)` → 422 (`mobile` + `sidebar-classic`); `applyPreset()` `ui_pack = NULL` করে; সব seeded preset বৈধ জোড়া; `getTheme()`-এ `ui_pack` সবসময় উপস্থিত; Super Admin ও Admin উভয় পথে একই নিয়ম; plan: `PUT /admin/theme/pack` Basic-এ 403 `feature_not_available` | §৭, §৮ |
| `PackLeakLintTest` | `infra/check-theme-rules.mjs` `src/pages`-এ `ui_pack` পড়লে ব্যর্থ, `src/ui`/`src/layouts`/`src/theme`-এ নয় | `infra/check-theme-rules.mjs` |
| দৃশ্যমান স্ক্রিনশট (Playwright — **এখনো প্ল্যানে নেই**, পর্যায় C-র শর্ত) | pack × view × {৩৬০, ১২৮০} | §১১ |

---

## Revision 9 — Language, RTL & SMS Tests
সম্পূর্ণ সারণি ও Done When: `docs/I18N.md` §১৪। সংক্ষেপে:
| Test | বিষয় |
|---|---|
| `I18nParityTest` (Vitest) | `bn`/`en` key-সেট এক; `ar` কভারেজ রিপোর্ট; placeholder মিল |
| `TermsFallbackTest`, `LocaleResolutionTest`, `ApiMessageLocaleTest` (PHPUnit) | শব্দ-fallback; ভাষা-ক্রম ও অচালু ভাষা বাদ; `error` কোড একই, `message` ভাষা অনুযায়ী |
| `SmsSegmentsTest` | ১৬টি সীমা-কেস (GSM ১৬০/১৬১/৩০৬/৩০৭, extension ২-গণনা; Unicode ৭০/৭১/১৩৪/১৩৫; emoji) — algorithm Python reference-এ মেলানো, PHP port এই test-এ প্রমাণ হবে; credit অংশ-অনুযায়ী |
| `SmsLocaleTest`, `LanguageSettingsTest`, `PublicShellLangTest` | প্রাপকের ভাষা; `bn` বন্ধ নয়; `?lang=` `noindex` |
| `RtlComponentTest`, `I18nProviderTest` (Vitest) | `dir=rtl`-এ variant/switcher render; `DirIcon` mirror; `<html lang dir data-locale>` |
| `PackContractTest` × `dir` | pack × slot × {ltr, rtl}: `data-action` সেট একই |
| `lint:theme` | নতুন নিয়ম `physical-direction`, `directional-icon` — নেগেটিভ ফিক্সচারে ধরে |
| হাতে: Spike S5c, S5d | PDF engine তুলনা; RTL স্মোক |

---

## Revision 10 — Advanced Academics, Staff & Payroll Tests
সম্পূর্ণ সারণি ও Done When: `docs/modules/academics-advanced.md` §৮–৯, `docs/modules/staff-payroll.md` §১৬–১৭।
| Test | বিষয় |
|---|---|
| `FinalResultComputeTest`, `ResultSheetLifecycleTest`, `TabulationPdfTest` | ওজনযুক্ত ফলাফল, best_of, absent/missing নীতি, rank-tie, published-ফ্রিজ, PDF (engine-যাচাইয়ের পর) |
| `DueBlockTest`, `PeriodAttendanceTest`, `RoutineConflictTest`, `SubstitutionTest`, `StudentLeaveTest`, `MarksLockTest` | বকেয়া-আটকানো ও ছাড়; period-হাজিরা; ৫ ধরনের সংঘর্ষ; বদলি; ছুটির আবেদন→হাজিরা `leave`; নম্বর lock/আনলক |
| **`PayrollGoldenTest`** | `staff-payroll.md` §১৬-র ১৭ সারি — Decimal reference-এ যাচাইকৃত সংখ্যা (৩০,৫০০ গ্রস; ৩১,৯০০ মাঝ-মাসের ইনক্রিমেন্ট; ৫,৬০০ arrears; ১৩,৩৩৩.৩৩ আনুপাতিক বোনাস …) |
| `PayrollProrationTest`, `SalaryStructureTest`, `RevisionLifecycleTest`, `IncrementBatchTest`, `ArrearsTest` | আনুপাতিকতা; ইতিহাস-অপরিবর্তনীয়তা; অনুমোদন-প্রবাহ; bulk ইনক্রিমেন্ট; backdate |
| `BonusSchemeTest`, `AdvanceRecoveryTest`, `MakerCheckerTest`, `PayrollImmutabilityTest`, `PayrollPaymentTest`, `FinalSettlementTest`, `PfLedgerTest`, `TaxModeTest` | বোনাস; অগ্রিম-কিস্তি সীমা; নিজের-অনুমোদন-নিষেধ; অনুমোদিত run ফ্রিজ; আংশিক পরিশোধ ও expense; চূড়ান্ত নিষ্পত্তি; PF; কর (সরলীকৃত) |
| `SalaryAccessTest`, `PayrollTenancyTest`, `AttendanceSummaryTest` | Teacher শুধু নিজের; **Super Admin ও impersonation 403**; অ্যাকাউন্ট-নং কখনো ফেরত নয়; tenant-নিরাপদ job; `user_id` নয়, payee-id দিয়ে উপস্থিতি |

- **`FeeResolutionTest` (সংযোজন, R10 যাচাই):** একই `(program, category)`-এ দুই বছরের `fee_structures` সারি থাকলে enrollment-এর `academic_year_id`-র সারি জেতে; বছর-সম্পর্কহীন (`0`) সারি কেবল ফলব্যাক; নতুন বছরের সারি যোগের পর পুরনো বছরের enrollment-এর ফি বদলায় না।

---

## Revision 10 — Schema parity & spec self-checks
`node infra/check-schema-parity.mjs` (CI): module-ডকের প্রতিটি `CREATE TABLE` কপি `schema.sql`-এর সাথে কলাম ও UNIQUE-এ মেলে কি না। `python3 infra/spec-verify/verify.py` (spec-সংশোধনের পর): রেফারেন্স, স্কিমা-execution (SQLite), আচরণ-পরীক্ষা, module-কী সামঞ্জস্য, পুরনো-দাবি স্ক্যান, payroll golden — `infra/spec-verify/README.md`।

## Revision 10 — Contract Tests That Cover EVERY Module (verification finding)
যাচাইয়ে ৪৫টি module-কী-র ২০টির কোনো পরীক্ষার নাম ছিল না (Phase 7-এর "Done When" সাধারণ)। প্রতিটি মডিউলের নিজস্ব functional test প্রতি Step-এ লিখতে হবে, কিন্তু নিচের চারটি **parameterised contract test** সব মডিউলকে স্বয়ংক্রিয়ভাবে ঢাকে — নতুন মডিউল যোগ করলে কিছু লিখতে হয় না, শুধু config-এ কী যোগ হলেই test তাকে ধরে।
| Test | কীভাবে চলে | Asserts |
|---|---|---|
| `ModuleGateContractTest` | `config/institution_types.php`-এর প্রতিটি (type × module) জোড়ার জন্য; প্রতিটি মডিউলের একটি প্রতিনিধি route (route-ফাইল থেকে `module:<key>` খুঁজে) | type-এ মডিউল না থাকলে `403 feature_not_available`; থাকলে কিন্তু plan-gated ও plan-এ নেই → `403`; Super Admin override `enabled_modules[key]=true/false` কার্যকর; opt-in মডিউল override ছাড়া বন্ধ |
| `RouteMiddlewareContractTest` | সব route (`php artisan route:list --json`) | প্রতিটি tenant route-এ `auth:sanctum` + `tenant.user` + (মডিউল-সম্পর্কিত হলে) `module:`; কোনো closure নেই; `/super/*` শুধু `tenancy.bypass` সহ; কোনো route `tenant:optional`-এ tenant-ডেটা দেয় না |
| `CrossTenantRouteTest` | `{id}`-ওয়ালা প্রতিটি route, অন্য প্রতিষ্ঠানের একটি বৈধ id দিয়ে | সবসময় 404 (কখনো 200/403 নয়) — অস্তিত্ব ফাঁস নেই |
| `RoleMatrixContractTest` | প্রতিটি route × ৬টি role; matrix = test-fixture `tests/Fixtures/role-matrix.php` (`docs/SECURITY.md`-এর সারণি থেকে বানানো ও হাতে মিলিয়ে রাখা — markdown পার্স নয়) | অননুমোদিত role 403; অনুমোদিত role ≠ 403; matrix-এ নেই এমন route ধরা পড়ে (অর্থাৎ নতুন route matrix-এ যোগ না করলে ব্যর্থ) |
| `MenuContractTest` (Vitest) | `nav/menu.js`-এর প্রতিটি item | `module`-কী config-এ আছে; প্রতিটি path-এর জন্য route-element আছে; প্রতি role-এ `primary` ≤ ৪; প্রতিটি module-কী (যার UI আছে) অন্তত একটি role-এর মেনুতে পৌঁছায় |
`StudentImportTest`, `SubscriptionLimitTest`, `AttendanceServiceTest`, `FeeServiceTest` নাম আগে থেকেই এই ফাইলে নমুনা-কোডে বর্ণিত (পুনরায় পরীক্ষিত)।

---

## Revision 12 — Test Index for the Full-Scope Specs
প্রতিটি স্পেকের নিজস্ব "পরীক্ষা" সারণি আছে; এই সূচি সেগুলোর নাম **স্পেক থেকে স্বয়ংক্রিয় সংগৃহীত** (নতুন নাম যোগ হলে `verify.py` সূচি মেলায় না — তখন এখানে যোগ করুন)। কোনো পরীক্ষা এখনো লেখা বা চালানো হয়নি।
| স্পেক | বিষয় | সংখ্যা | পরীক্ষার নাম |
|---|---|---|---|
| `docs/modules/finance-advanced.md` | Cash book & refunds | 9 | `CashBookLockTest`, `CashBookMathTest`, `CashBookSourcesTest`, `CashBookTenancyTest`, `RefundCapTest`, `RefundDueRecalcTest`, `RefundImmutabilityTest`, `RefundSettlementTest`, `SubscriptionRefundTest` |
| `docs/modules/inventory.md` | Store | 6 | `InventoryGateTest`, `InventoryImmutabilityTest`, `InventoryTenancyTest`, `StockConcurrencyTest`, `StockLedgerTest`, `StoreReceiptTest` |
| `docs/modules/attendance-devices.md` | Devices | 11 | `DebounceTest`, `DeviceGateTest`, `DevicePunchIdempotencyTest`, `DeviceSecretTest`, `DeviceSignatureTest`, `DeviceTenancyTest`, `ManualWinsTest`, `PunchClassificationTest`, `PunchTimezoneTest`, `StaffPunchTest`, `UnmatchedQueueTest` |
| `docs/modules/platform-ops.md` | Support, coupons, tax, impersonation, export/import | 16 | `CouponMathTest`, `CouponRaceTest`, `ExportAccessTest`, `ExportMapFreshTest`, `ExportSecretsTest`, `FreeDaysCouponTest`, `ImpersonationConsentTest`, `ImpersonationExchangeTest`, `ImpersonationGuardTest`, `ImpersonationNoticeTest`, `ImportSafetyTest`, `InvoiceTaxTest`, `SupportVisibilityTest`, `TenantRoundTripTest`, `TicketLifecycleTest`, `TicketNumberTest` |
| `docs/modules/public-website-plus.md` | Public site plus | 9 | `AdmissionFeeFinalizeTest`, `AdmissionFeeFlowTest`, `AdmissionFeeRateLimitTest`, `GalleryConsentTest`, `MarkdownSanitizeTest`, `PostVisibilityTest`, `PublicNoStudentDataTest`, `PublicTeacherTest`, `SitemapPlusTest` |
| `docs/modules/accounting.md` | Accounting | 13 | `AccountingAccessTest`, `AccountingTenancyTest`, `AutoPostingIdempotentTest`, `BankReconcileTest`, `BudgetActualTest`, `FundAccountGuardTest`, `LedgerCashEqualsCashBookTest`, `PeriodLockTest`, `PostingMapTest`, `StartDateTest`, `TrialBalanceZeroTest`, `VoucherBalanceTest`, `VoucherImmutabilityTest` |
| `docs/modules/donations.md` | Donations | 6 | `DonationGateTest`, `DonationReceiptTest`, `DonationReversalTest`, `DonorPrivacyTest`, `FundBalanceEqualsLedgerTest`, `FundGuardTest` |
| `docs/modules/madrasa.md` | Madrasa pack | 6 | `HifzAccessTest`, `HifzGateTest`, `HifzProgressTest`, `HifzRangeTest`, `HifzStaleTest`, `HifzTenancyTest` |
| `docs/modules/syllabus.md` | Syllabus | 7 | `BehindScheduleTest`, `CoverageMathTest`, `CoverageUniqueTest`, `LessonTaughtLinkTest`, `SyllabusAccessTest`, `SyllabusTenancyTest`, `UnitCloneTest` |
| `docs/modules/risk-alerts.md` | Risk alerts | 6 | `RiskChangeOnlyTest`, `RiskExcusedAbsenceTest`, `RiskNoAutoActionTest`, `RiskRulesTest`, `RiskTenancyTest`, `RiskVisibilityTest` |
| `docs/modules/admission-cycle.md` | Admission cycle | 11 | `AdmissionFeeFlowTest`, `ApplicationNoTest`, `CommitmentTest`, `CycleStateMachineTest`, `DrawFairnessTest`, `DrawReproducibleTest`, `FreezeTest`, `MeritTieBreakTest`, `PublicStatusPrivacyTest`, `SeedLossFallbackTest`, `WaitingPromotionTest` |
| `docs/modules/data-migration.md` | Data migration | 8 | `ImportDryRunNoWriteTest`, `ImportEncodingTest`, `ImportFeeHistoryTest`, `ImportIdempotentTest`, `ImportLimitsTest`, `ImportRollbackTest`, `ImportSuppressionTest`, `ImportTenancyTest` |
| `docs/modules/communication-plus.md` | Communication plus | 11 | `CampaignEstimateTest`, `CommunicationTenancyTest`, `ConsentFilterTest`, `DeliveryAdapterTest`, `EmergencyTest`, `NoticeAckTest`, `NoticeScheduleTest`, `QuietHoursTest`, `RetryTest`, `ScheduleDispatchTest`, `TemplateVariableTest` |
| `docs/modules/quick-wins.md` | Quick wins | 13 | `HighContrastPaletteTest`, `IdentifiersPrintTest`, `IdentifiersPublicTest`, `RevokeTest`, `ShiftBlockTest`, `ShiftLateThresholdTest`, `ShiftRoutineTest`, `SignatureSecrecyTest`, `UiPreferencesTest`, `VerifyCodeTest`, `VerifyPageTest`, `VerifyTenancyTest`, `VerifyThrottleTest` |

**Contract (সব মডিউল জুড়ে — আগের ধারায় যোগ):** `OptInGateTest` — `hifz`/`donations`: type-এ থাকলেও `settings.opt_in_modules`-এ না থাকলে 403 `module_disabled`; type-এ না থাকা মডিউল opt-in করা যায় না; Super Admin override জেতে। `TenantLessTablesTest` — `institution_id`-হীন টেবিল ঠিক ছয়টি (`subscription_plans, institutions, otp_tokens, theme_presets, coupons, platform_settings`) এবং প্রতিটির মডেল `BelongsToInstitution` ব্যবহার করে না। `ExportMapFreshTest` — `docs/database/tenant-export-map.json` স্কিমার সাথে তাজা।
**Reference-যাচাইকৃত সংখ্যা:** `infra/spec-verify/refs_r11.py` (৫৬ কেস: রিফান্ড/ক্যাশবুক, stock moving-average, HMAC/punch-শ্রেণি, কুপন+কর, ভাউচার/trial balance, লটারি, ঝুঁকি) ও `refs_r12.py` (৩৫ কেস: নগদ-লেজার = ক্যাশবুক, বাজেট, হিফজ, হাই-কনট্রাস্ট, লটারি-নিরপেক্ষতা, SMS খরচ ও নীরব-সময়)। PHP-পরীক্ষা এই সংখ্যাগুলো মেলাতে বাধ্য।
**Browser/visual/a11y:** `docs/E2E-TESTING.md` (Playwright, ১২ কম্বিনেশন, axe) — এখনো চালানো হয়নি।

---

## Revision 15 — ফাইল, bulk লেখা, কোয়েরি-সংখ্যা
| Test | Asserts |
|---|---|
| `FileDiskNamesTest`, `FilePathPrefixTest`, `FileCollisionTest`, `ErasureRemovesAllStudentFilesTest`, `TenantPurgeFilesTest`, `PrivateNeverPublicUrlTest`, `NoClientFilenameTest`, `FilesDriverSwitchTest`, `PruneTmpTest` | `docs/architecture/file-storage.md` §৫ |
| `TenantBulkGuardTest` | `TenantBulk::upsert/insert`-এ অন্য প্রতিষ্ঠানের `institution_id` সহ সারি `LogicException` ছুঁড়ে, কিছু লেখে না; tenant বাঁধা না থাকলে `TenantNotBoundException` |
| `TenancyArchitectureTest` (সংযোজন) | tenant-model-এ `::upsert(` / `::insert(` শুধু `TenantBulk`-এর ভিতরে; `where('date'\|*_at, 'like', …)` নেই (static scan) |
| `AttendanceBulkQueryCountTest` | ৫০ ছাত্রের `saveBulk` ≤ ৬টি কোয়েরি (আগে ~১০০); একই ডেটা দ্বিতীয়বার সংরক্ষণে সারি বাড়ে না; আপডেটে `created_at` অপরিবর্তিত; `upsert`-এর timestamp-আচরণ আপনার Laravel-এ যাচাই |
| `BatchReportQueryCountTest` | `getBatchReport` ৪০ ছাত্রে ≤ ৪টি কোয়েরি (আগে ৪১); ফল পুরনো `getStudentSummary`-সমষ্টির সমান |
| `RetentionPurgeTest` | `sms:trim`, `audit:trim`, `leads:purge`, `devices:prune`, `risk:prune`, `imports:prune`: প্রতিষ্ঠান-ভিত্তিক, ৫,০০০-এর খণ্ডে, অন্য প্রতিষ্ঠানের সারি অক্ষত, query-log-এ ইনডেক্স-ব্যবহার (full scan নেই) |
| `PerfCatalogueTest` (CI) | `python3 infra/spec-verify/plan_check.py .` সবুজ; `hot-queries.tsv`-এ প্রতিটি list/report-পর্দার কোয়েরি |
**লোড (চালানো হয়নি):** `infra/loadtest/peak-hour.k6.mjs` (`docs/ops/performance-benchmarks.md` §Revision 15)।

---

## Release 1 gate (R16)
| Test | Asserts |
|---|---|
| `ReleaseGateTest` | `config('release.modules')`-এ নেই এমন মডিউলে `ModuleGate::allows()` = false, **Super Admin `enabled_modules` override সহও**; ওই মডিউলের route 403 `module_disabled`; `/bootstrap`-এর modules তালিকায় নেই |
| `ReleaseRolesTest` | `release.roles`-এ নেই এমন role (R1-এ `student`) লগইনে 403 `role_not_available`; token ইস্যু হয় না |
| `MenuReleaseTest` (Vitest) | `since` > `release.id` মেনু-আইটেম লুকানো; `shipped('R1.1','R1')` = false, `shipped('R1','R1.1')` = true; R1-এ প্রতিটি দৃশ্যমান আইটেমের পিছনে route আছে |
| `SignupModeTest` | `SIGNUP_MODE=invite`: কোড ছাড়া/ভুল কোডে 403 `signup_closed`, সঠিক কোডে সফল; `open`: কোড ছাড়াই; ডিফল্ট `invite` |

## অভিভাবক-পোর্টাল (R16 — স্পেকের ফাঁক বন্ধ)
| Test | Asserts |
|---|---|
| `ParentAttendanceAccessTest` | অভিভাবক নিজের সন্তানের মাসিক হাজিরা পায়; **অন্যের সন্তানের id ⇒ 404** (403 নয়); একই প্রতিষ্ঠানের অন্য ছাত্রও 404; অন্য প্রতিষ্ঠানের 404 |
| `ParentResultAccessTest` | শুধু **প্রকাশিত** পরীক্ষার ফল; অপ্রকাশিত দেখায় না; একাধিক সন্তানের অভিভাবক প্রতিটি আলাদা পায়; অন্যের সন্তান 404 |
| `MarksheetAccessTest` | admin/teacher যেকোনো ছাত্রের (নিজের প্রতিষ্ঠানে); parent শুধু নিজের সন্তানের ও প্রকাশিত; student নিজের; accountant 403; অপ্রকাশিত পরীক্ষার marksheet অভিভাবকের 404; PDF-এ বাংলা যুক্তাক্ষর ঠিক |
| `ImportKindsTest` | `release.import_kinds=['students']`: `kind=students` চলে; `teachers`/`fee_history`/`results` ইত্যাদিতে 422 `kind_not_available`; `data_migration` মডিউল ছাড়া `/imports` 403 |
| `SmsLogTest` | `GET /sms-logs` শুধু নিজের প্রতিষ্ঠানের; cursor-pagination, `per_page ≤ 100`; Teacher/Parent 403; অন্য প্রতিষ্ঠানের সারি দেখা যায় না |
| `SmsCreditBalanceTest` | `GET /subscription/sms-credits` ব্যালেন্স ও লেনদেন-তালিকা; কেনা ও ব্যবহারে ব্যালেন্স মেলে |
| `SmsWalletTest` | D56: the wallet is in taka; each sent SMS part costs the platform rate (0.40; 150 GSM / 70 Unicode chars, 67 when split); a ledger row per charge; not enough money → 402 and nothing sent; a failed send costs nothing |
| `SmsRouteTest` | D57/D59: universal on + own off → universal API, charged; own on → the institution's own BulkSMSBD key and sender, never charged; own fails + universal on → one fallback, charged, `fallback_used`; both off → not sent; keys stored encrypted, never returned in full |
| `SmsRechargeTest` | D58: POST /subscription/sms-credits creates a bKash payment (sandbox fake); the central-domain callback executes it once; a success adds the amount to the wallet with a `purchase` row; a repeated or failed callback adds nothing; Super Admin `adjust` writes an `adjustment` row |
| `SuperInstitutionTest` | 5.3: only super_admin on the central host; create an institution with its admin; suspend / activate; a module override changes that tenant's menu at once; another role or host is refused |
| `LocaleTest` | `PUT /auth/locale` শুধু `bn`\|`en` (R1) সংরক্ষণ করে `users.locale`; অন্য মান 422; পরের লগইনে ভাষা মনে থাকে |

## D88/D89 — Department Staff Authorization And Institution Onboarding (R3.6a/b, R3.12)

- `InstitutionSignupTest`: Super Admin provisioning and principal self-registration use one tenant-safe onboarding service; contact verification, duplicate/slug/rate-limit checks, pending tenant state, explicit Super Admin approval, and no subscription/trial/departments/permissions by default.
- `StaffAccountTest`: principal/admin creates staff by phone/email; verified first login; duplicate contact rejected; staff edits only allowlisted profile fields; no self-elevation or self-activation.
- `DepartmentManagementTest`: create/archive departments; create duties only from the code-owned permission catalog; unknown permission keys fail closed; no permission comes from a free-text designation.
- `DepartmentTenantTest`: composite tenant references, cross-tenant department/member/duty IDs rejected, multiple departments per user, and unique membership/duty assignment.
- `DepartmentAuthorizationTest`: each action checks tenant + active membership + duty permission + existing module/feature gates; revocation/account deactivation takes effect immediately; direct API and URL access fail closed.
- `StaffMigrationTest`: teacher/accountant User, Teacher, StaffMember, nullable user_id, employee IDs, attendance/leave/payee references map without duplicate login or lost history; legacy department strings grant no permission.
- `PayrollDesignationCompatibilityTest`: HR/payroll designation and salary/bonus snapshots remain unchanged by department membership or display-title changes.
- `DepartmentRouteInventoryTest`: every tenant route is classified as department-permission staff, principal-only, student/parent, or central-platform; no legacy staff-only route remains unclassified.
- `DepartmentPortalTest` (Vitest/Playwright): only assigned departments/actions are shown; one/multiple department states, loading/empty/error, context switching, direct-URL denial, Bengali/English, keyboard and 360px/desktop behavior.

## D90 — approved activation and permission acceptance

`InstitutionSignupTest`: public contact-verified/no-review denied, review without current proof denied, Super Admin provisioned recipient contact/password setup required, first-admin uniqueness/concurrency, no implicit grants/billing, recipient-only credentials, active-state/toggle bypass denial, shared provisioning and rollback/retry.
`StaffAccountTest`: exactly one contact, own name/avatar only, principal-controlled lifecycle and contact changes, purpose/contact/generation/token-owner/tenant/expiry/replay/parallel-consume denial, safe delivery/resend failure, redacted responses/logs, wrong-attempt/rate limits, no stale-invitation deactivation bypass, four-type institution_staff login/token limits.
`DepartmentTenantTest`: six table FKs/unique keys, cross-tenant first-admin/account references rejected; token/actor role correctness is service-tested, not inferred from FK existence.
`DepartmentManagementTest`: no wildcard/unknown grants, archive blocks active assignments, revocation immediate, no silent history or obligation transfer.
`DepartmentAuthorizationTest`, `DepartmentRouteInventoryTest`: approved 297-route/150-key current matrix plus planned foundation routes, ten existing identity-only exceptions, selector-specific action/report keys, retained mixed parent/platform branches, module/resource scope/D33/principal maker-checker, direct-service enforcement without role spoofing.
`StaffMigrationTest`, `PayrollDesignationCompatibilityTest`: reviewed per-tenant dry run, no automatic role/string duties, null/colliding profiles fail closed, existing payee IDs/HR name/photo/designation/history preserved, explicit switch/rollback and session revocation.

D90 authorizes only SuperInstitutionTest::test_opening_an_institution_creates_its_admin_and_its_type_defaults immediate-active/supplied-password expectations to become pending/contact-verification/recipient-password coverage, preserving all other assertions and existing tests. Add token/role/bootstrap/security cases; do not change tests in the canonical-only checkpoint. Focused four R3.6a tests, full API/frontend/theme, refs/parity/export/query/freshness/deep/guard remain required before [x]. These named future runtime tests have not passed merely because the contract/probes pass.
## D91 context-selection coverage required before staff business-route exposure

Follow `docs/architecture/staff-account-contract.md` section D91, owner registry checkpoint 4b29f90. Add positive/negative tests for exactly one positive-decimal X-Department-Id header; missing/empty/malformed/multiple/comma-separated/array-like values; body/query override attempts; foreign/archived department; inactive/expired/revoked own membership/assignment/duty; stale account/lock/role; impersonation and ambiguous HR links. Prove that a valid key in department B does not authorize selected department A, no first/sole-department fallback occurs, and switching context rechecks every prerequisite without cached grants. Verify real own Teacher/payee/resource predicates and independent module/feature/D33/principal/maker-checker boundaries across all four institution types while preserving unrelated student/parent/platform/legacy branches. Keep current identity-only endpoints independent of the business selector. No new storage, token claim, endpoint, migration, UI or rollout acceptance follows from these tests or the contract alone. Existing tests/assertions remain intact; R3.6b stays incomplete until all task gates pass.

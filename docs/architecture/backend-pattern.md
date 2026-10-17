# Laravel Backend Pattern

## Request Flow
Route → Middleware → FormRequest → Controller → Service → Model → Resource → Response

## Packages
- laravel/sanctum: API authentication
- (spatie/laravel-permission ব্যবহার হয় না — authorization = `users.role` + `RoleMiddleware`, `docs/LOCKED-DECISIONS.md` D17)
- barryvdh/laravel-dompdf: PDF generate
- maatwebsite/excel: Excel export
- sslcommerz/ssl-commerz-laravel: SSLCommerz

## Controller Pattern (Keep It Thin)
```php
class StudentController extends Controller {
    public function __construct(private StudentService $studentService) {}
    public function index(Request $request) {
        return StudentResource::collection(
            $this->studentService->getList($request->all())
        );
    }
    public function store(StoreStudentRequest $request) {
        return new StudentResource(
            $this->studentService->create($request->validated())
        );
    }
}
```

## Service Pattern (All Logic Goes Here)
```php
class StudentService {
    public function create(array $data) {
        $student = Student::create($data);
        User::create(['role'=>'student', 'password'=>bcrypt($student->student_id), ...$data]);
        $this->smsService->send($data['guardian_phone'], "ভর্তি সম্পন্ন। ID: {$student->student_id}");
        return $student;
    }
}
```

## Route Grouping
তিন host-mode (`tenant` / `tenant:central` / `tenant:optional`) এবং প্রতিটি module-এ `module:x` — সম্পূর্ণ `routes/api.php`: `docs/templates/laravel-core-files.md`। সংক্ষেপে:
```php
Route::prefix('v1')->group(function () {
    Route::middleware('tenant:optional')->group(fn () => Route::post('/auth/login', [LoginController::class, 'login']));   // any host
    Route::middleware(['tenant', 'auth:sanctum', 'tenant.user', 'subscription'])->group(function () {                      // tenant host only
        Route::middleware('role:admin')->group(fn () => Route::apiResource('students', StudentController::class));
        Route::middleware(['role:admin,teacher', 'module:attendance'])->group(fn () => Route::post('/attendance', [AttendanceController::class, 'store']));
    });
});
```

## GPA / Grade Calculator
গ্রেড ও GPA শুধু `ResultService` (`docs/modules/grading.md` "Revision 6.3 ResultService"): শতকরা-ভিত্তিক, component-aware, কোনো F থাকলে GPA ০, `settings.use_gpa` ঐচ্ছিক। এখানে আলাদা সরল `avg(grade_point)` নেই।

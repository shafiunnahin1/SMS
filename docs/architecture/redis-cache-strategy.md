# Redis Cache Strategy

## What to Cache?
```php
// config/cache.php → default: 'redis'

// 1. Institution Config (queried repeatedly in TenantMiddleware)
Cache::remember("institution:{$slug}", 3600, fn() =>
    Institution::with('subscriptionPlan')->where('slug', $slug)->first()
);
// Invalidate: when Institution is updated → Cache::forget("institution:{$slug}")

// 2. Dashboard Stats (heavy query, accessed frequently)
Cache::remember("dashboard:{$institutionId}", 300, fn() => [
    'total_students' => Student::count(),
    'total_teachers' => Teacher::count(),
    'monthly_income' => FeePayment::whereMonth('paid_at', now()->month)->sum('paid_amount'),
    'total_dues'     => $this->calculateTotalDues(),
]);
// Invalidate: when a new student/fee is added

// 3. User Permissions (spatie/permission)
// spatie caches this automatically — config: permission.cache

// 4. Class/Batch List (needed repeatedly for dropdowns)
Cache::remember("programs:{$institutionId}", 3600, fn() =>
    Program::with('batches')->get()
);

// 5. bKash Token (for 1 hour)
Cache::remember('bkash_token', 3500, fn() => $this->fetchBkashToken());
```

## Cache Invalidation Pattern
```php
// Auto-invalidate via Observer pattern
// app/Observers/StudentObserver.php
class StudentObserver {
    public function created(Student $student): void {
        Cache::forget("dashboard:{$student->institution_id}");
    }
    public function deleted(Student $student): void {
        Cache::forget("dashboard:{$student->institution_id}");
    }
}

// AppServiceProvider.php
Student::observe(StudentObserver::class);
```

## Redis Queue Config
```php
// .env
QUEUE_CONNECTION=redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=null

// Queue channels
'default'      → সাধারণ jobs
'sms'          → SMS jobs (separate worker)
'notifications'→ Push notification jobs
'reports'      → Excel/PDF generation jobs (slow)

// Supervisor — separate worker per queue
php artisan queue:work redis --queue=sms --tries=3
php artisan queue:work redis --queue=default --tries=3
php artisan queue:work redis --queue=reports --timeout=120
```

## React Query Cache Config
```javascript
// main.jsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,     // 5 মিনিট stale
      cacheTime: 10 * 60 * 1000,    // 10 মিনিট cache
      refetchOnWindowFocus: false,   // window focus-এ refetch না
      retry: 1,                      // failure-এ ১ বার retry
    },
  },
})

// Specific overrides
// Attendance: always fresh
useQuery({ queryKey: ['attendance'], staleTime: 0 })

// Dashboard: 1 minute
useQuery({ queryKey: ['dashboard'], staleTime: 60 * 1000 })

// Class list: 1 hour (rarely changes)
useQuery({ queryKey: ['programs'], staleTime: 60 * 60 * 1000 })
```

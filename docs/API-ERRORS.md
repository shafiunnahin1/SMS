# API Error Handling

> **Revision 9:** `message` ও `errors` এখন **প্রতি-অনুরোধের ভাষায়** (`bn`/`en`/`ar`, `docs/I18N.md` §৬): `message = __("errors.{$code}")`, `lang/{bn,en,ar}/errors.php`। `error` কোড ভাষা-নিরপেক্ষ ও স্থির — frontend তার উপর শর্ত লেখে, `message`-এর পাঠের উপর নয়। নিচের উদাহরণে বাংলা literal ইতিহাস; নতুন কোডে key।

## Standard Error Response Format
```json
{
  "success": false,
  "error": "error_code",
  "message": "মানুষের বোধগম্য বার্তা",
  "errors": {
    "field_name": ["ভ্যালিডেশন এরর বার্তা"]
  },
  "meta": {
    "request_id": "uuid",
    "timestamp": "2025-01-15T10:30:00Z"
  }
}
```

## HTTP Status Codes
| Code | When | Error Code |
|------|-----|-----------|
| 200 | সফল | — |
| 201 | তৈরি সফল | — |
| 400 | ভুল request | `bad_request` |
| 401 | Token নেই/ভুল | `unauthenticated` |
| 403 | অ্যাক্সেস নেই | `forbidden` / `subscription_expired` / `feature_not_available` / `limit_reached` |
| 404 | পাওয়া যায়নি | `not_found` / `institution_not_found` |
| 422 | Validation ব্যর্থ | `validation_failed` |
| 429 | বেশি request | `too_many_requests` |
| 500 | Server error | `server_error` |

## Laravel Exception Handler
```php
// app/Exceptions/Handler.php
public function register(): void {
    $this->renderable(function (\Illuminate\Auth\AuthenticationException $e) {
        return response()->json([
            'success' => false,
            'error'   => 'unauthenticated',
            'message' => 'লগিন করুন',
        ], 401);
    });

    $this->renderable(function (\Illuminate\Validation\ValidationException $e) {
        return response()->json([
            'success' => false,
            'error'   => 'validation_failed',
            'message' => 'ইনপুট যাচাইয়ে ত্রুটি',
            'errors'  => $e->errors(),
        ], 422);
    });

    $this->renderable(function (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
        return response()->json([
            'success' => false,
            'error'   => 'not_found',
            'message' => 'তথ্য পাওয়া যায়নি',
        ], 404);
    });

    $this->renderable(function (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
        return response()->json([
            'success' => false,
            'error'   => 'server_error',
            'message' => 'সার্ভারে সমস্যা হয়েছে',
        ], $e->getStatusCode());
    });
}
```

## React axios Error Interceptor
```javascript
// api/axios.js
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const { response } = error
    if (!response) {
      addToast('ইন্টারনেট সংযোগ পরীক্ষা করুন', 'error')
      return Promise.reject(error)
    }

    switch (response.status) {
      case 401:
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
        break
      case 403:
        const errCode = response.data?.error
        if (errCode === 'subscription_expired') {
          window.location.href = '/admin/subscription/expired'
        } else if (errCode === 'feature_not_available') {
          useUiStore.getState().openUpgradeModal({
            feature: response.data?.feature,
            requiredPlan: response.data?.upgrade_to,
          })
        } else if (errCode === 'limit_reached') {
          addToast(`সীমা শেষ হয়েছে: ${response.data?.message}`, 'warning')
        } else {
          addToast('এই কাজ করার অনুমতি নেই', 'error')
        }
        break
      case 422:
        // Validation errors — shown in form via react-hook-form
        break
      case 429:
        addToast('অনেক বেশি অনুরোধ করা হয়েছে। একটু অপেক্ষা করুন।', 'warning')
        break
      case 500:
        addToast('সার্ভারে সমস্যা হয়েছে', 'error')
        break
    }
    return Promise.reject(error)
  }
)
```

## Custom Business Logic Errors
```php
// app/Exceptions/BusinessException.php
class BusinessException extends \Exception {
    public function __construct(
        string $message,
        private string $errorCode = 'business_error',
        int $statusCode = 400
    ) {
        parent::__construct($message, $statusCode);
    }
}

// Usage
throw new BusinessException('বইটি বর্তমানে পাওয়া যাচ্ছে না', 'book_unavailable');
throw new BusinessException('ছাত্রের সংখ্যা সীমা পৌঁছে গেছে', 'student_limit_reached', 403);
```

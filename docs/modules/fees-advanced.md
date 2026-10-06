# Advanced Fee Management

## Student ID Auto-Generation (Revision 7)
প্রতিষ্ঠানভিত্তিক unique (`UNIQUE (institution_id, student_id)`), এবং একসাথে দুটি ভর্তি/import হলেও duplicate নয় — তাই institution row লক করে (transaction-এর ভেতরে কল করতে হবে)।
```php
// Services/StudentService.php
public function generateStudentId(): string
{
    $institution = app('currentInstitution');
    Institution::whereKey($institution->id)->lockForUpdate()->value('id');          // serialise numbering per institution
    $prefix = strtoupper(substr($institution->slug, 0, 3)) . '-' . date('Y') . '-';  // e.g. DHA-2026-
    $last = Student::withTrashed()->where('student_id', 'like', $prefix . '%')->orderByDesc('student_id')->value('student_id');
    return $prefix . str_pad($last ? ((int) substr($last, -4)) + 1 : 1, 4, '0', STR_PAD_LEFT);   // DHA-2026-0001 (resets each year)
}
```
(`withTrashed()` — মুছে-ফেলা ছাত্রের ID আবার দেওয়া যাবে না।)

## Receipt Number
রসিদ নম্বর `FeeService::nextReceiptNo()` (transaction + institution row lock; `docs/templates/laravel-core-files.md`)। এখানে আলাদা কোনো `generateReceiptNo()` নেই — পুরনোটি "শেষ row পড়ে +১" করত এবং দুই কাউন্টারে একসাথে আদায়ে একই নম্বর দিত।

## Invoice Number (SaaS Subscription)
```php
public function generateInvoiceNumber(): string {
    $lastInvoice = SubscriptionInvoice::orderBy('id','desc')->first();
    $sequence = $lastInvoice
        ? ((int) substr($lastInvoice->invoice_number, -5)) + 1
        : 1;
    return 'INV-' . date('Y') . '-' . str_pad($sequence, 5, '0', STR_PAD_LEFT);
    // Result: INV-2025-00001
}
```

## Fee Waiver Approval Workflow
```
ছাত্রের অভিভাবক/Admin → Waiver আবেদন করেন
  POST /fees/waivers
  { student_id, fee_category_id, waiver_type, waiver_amount, reason }

Accountant/Admin → Waiver list দেখেন
  GET /fees/waivers?status=pending

Admin → অনুমোদন বা প্রত্যাখ্যান
  PATCH /fees/waivers/{id}/approve { approved_amount }
  PATCH /fees/waivers/{id}/reject  { rejection_reason }

অনুমোদনের পর:
  → Fee collection-এ discount স্বয়ংক্রিয় প্রযোজ্য হয়
  → Parent/Student-কে SMS notification যায়
```

```php
// FeeWaiverService.php
public function approve(int $waiverId, float $approvedAmount): FeeWaiver {
    $waiver = FeeWaiver::findOrFail($waiverId);
    $waiver->update([
        'status'       => 'approved',
        'waiver_amount'=> $approvedAmount,
        'approved_by'  => auth()->id(),
        'approved_at'  => now(),
    ]);
    // Send SMS
    $this->smsService->send(
        $waiver->student->guardian_phone,
        "{$waiver->student->name}-এর ফি মওকুফ অনুমোদিত হয়েছে। পরিমাণ: ৳{$approvedAmount}"
    );
    return $waiver;
}
```

## Sibling Discount
```php
// Discount when siblings are in the same institution
public function calculateSiblingDiscount(int $studentId): float {
    $student  = Student::findOrFail($studentId);
    $siblings = Student::where('guardian_phone', $student->guardian_phone)
                       ->where('id', '!=', $studentId)
                       ->where('status', 'active')
                       ->count();
    return match(true) {
        $siblings >= 2 => 20.0,  // ৩য় সন্তান: ২০% ছাড়
        $siblings == 1 => 10.0,  // ২য় সন্তান: ১০% ছাড়
        default        => 0.0,
    };
}
```

## Late Fee Calculation
```php
// Fine if monthly fee is paid after the due date
public function calculateLateFee(string $month, \DateTime $paymentDate): float {
    $dueDay = 10; // প্রতি মাসের ১০ তারিখ deadline
    $monthDate = \DateTime::createFromFormat('Y-m', $month);
    $dueDate   = $monthDate->modify("day {$dueDay}");

    if ($paymentDate <= $dueDate) return 0.0;

    $lateDays = $paymentDate->diff($dueDate)->days;
    $perDayFine = 5.00; // প্রতিদিন ৫ টাকা
    $maxFine    = 100.00;
    return min($lateDays * $perDayFine, $maxFine);
}
```

## Bank / Cheque Payment Handling
```php
// Add to payment_method in fee_payments table:
// ENUM: 'cash','bkash','nagad','card','bank_transfer','cheque'

// Bank Transfer:
// Accountant verifies manually
// Needs bank_reference_no, bank_name, transfer_date fields

// Cheque:
// Needs cheque_no, bank_name, cheque_date, clearance_date fields
// status: 'pending_clearance' → 'cleared' বা 'bounced'

// Extra columns in fee_payments table:
ALTER TABLE fee_payments
    ADD COLUMN payment_reference VARCHAR(100) NULL,  -- bank ref / cheque no
    ADD COLUMN payment_bank VARCHAR(100) NULL,
    ADD COLUMN payment_date DATE NULL,
    ADD COLUMN clearance_status ENUM('na','pending','cleared','bounced') DEFAULT 'na';
```

## Program- / Batch-wise Fee Structure (Revision 7)
একই fee category-র ভিন্ন অঙ্ক program বা batch ভেদে — `fee_structures` (`batch_id = 0` = পুরো program, `> 0` = নির্দিষ্ট batch)। অঙ্ক নির্ধারণ **একটিই function**: `FeeService::resolveAmount(Enrollment, FeeCategory)` (ক্রম: `fee_override` > `batches.monthly_fee` > batch-এর structure > program-এর structure > category-র default; `program_specific` category-তে structure না থাকলে প্রযোজ্য নয়)। পুরনো `getStudentFeeAmount(studentId, categoryId)` নেই — কারণ coaching-এ একজন student-এর একাধিক enrollment, তাই "student-এর অঙ্ক" অর্থহীন; অঙ্ক সবসময় enrollment-এর। উদাহরণ: Class 1–5 = ৳৩০০, Class 6–10 = ৳৫০০ → প্রতিটি Program-এ একটি `fee_structures` row।

## Parent-Child Linking (Multiple Children)
```php
// One Parent's multiple children

// Create parent user at enrollment, or link to existing.
// Call this ONLY when the parent role exists for the institution type AND the portal is on:
//   in_array('parent', config("institution_types.{$type}.roles")) && ($type !== 'private_batch' || settings.student_portal)
// For private_batch (portal off) the guardian phone stays on students.guardian_phone and no parent user is created.
public function linkParent(int $studentId, array $parentData): void {
    // Does a parent account already exist for this phone number?
    $parentUser = User::where('phone', $parentData['guardian_phone'])
                      ->where('role', 'parent')
                      ->where('institution_id', app('currentInstitution')->id)
                      ->first();

    if (!$parentUser) {
        // R6: NEVER use the phone number as the password. Random password + forced change; the parent
        // sets their own password through "Forgot password" -> OTP to the phone (docs/AUTHORIZATION.md).
        $parentUser = User::create([
            'name'      => $parentData['father_name'] ?? $parentData['mother_name'],
            'phone'     => $parentData['guardian_phone'],
            'email'     => $parentData['guardian_email'] ?? null,
            'password'  => bcrypt(\Illuminate\Support\Str::random(16)),
            'must_change_password' => 1,
            'role'      => 'parent',
            'institution_id' => app('currentInstitution')->id,
        ]);
    }

    // Linking
    ParentStudent::firstOrCreate([
        'parent_user_id' => $parentUser->id,
        'student_id'     => $studentId,
        'institution_id'      => app('currentInstitution')->id,
    ], ['relationship' => 'guardian', 'is_primary' => true]);
}

// Child switcher on Parent Dashboard
// GET /parent/children → list of all children
// Store parent's selected child_id in session/localStorage
```

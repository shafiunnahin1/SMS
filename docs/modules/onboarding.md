# Institution Onboarding Wizard

## When Does It Show?
নতুন স্কুল প্রথমবার login করলে — `institution.onboarding_completed = false` থাকলে।

## Wizard Steps (React Multi-step Form)
```
Step 1: স্কুলের তথ্য সম্পূর্ণ করুন
  → স্কুলের লোগো আপলোড
  → ঠিকানা, ইমেইল, ফোন
  → শিক্ষাবর্ষ নির্বাচন (2024-2025)

Step 2: শ্রেণী সেটআপ
  → কতটি ক্লাস? (Class 1 to Class 10)
  → প্রতিটি ক্লাসে কতটি সেকশন? (A, B, C)
  → Bulk create বাটন → এক ক্লিকে সব তৈরি

Step 3: প্রথম শিক্ষক যোগ করুন
  → নাম, ইমেইল, ফোন, বিষয়
  → "আরো যোগ করুন" বাটন
  → অথবা "পরে করবো" skip option

Step 4: ফি ক্যাটাগরি সেটআপ
  → মাসিক বেতন: পরিমাণ input
  → পরীক্ষা ফি: পরিমাণ input
  → "আরো যোগ করুন" বাটন
  → ক্লাসভিত্তিক আলাদা ফি option

Step 5: সম্পন্ন!
  → "আপনার স্কুল প্রস্তুত!" বার্তা
  → Dashboard-এ যান বাটন
  → Quick links: ছাত্র ভর্তি, রুটিন তৈরি
```

## Laravel
```php
// Check in Admin middleware
if (!$institution->onboarding_completed && !request()->routeIs('onboarding.*')) {
    return redirect('/onboarding');
}

// POST /api/onboarding/complete
public function complete(): JsonResponse {
    app('currentInstitution')->update(['onboarding_completed' => true]);
    return response()->json(['message' => 'Onboarding completed']);
}

// New columns in institutions table:
// onboarding_completed TINYINT(1) DEFAULT 0
// onboarding_step INT DEFAULT 1
```

## React Wizard Component
```jsx
// pages/onboarding/Wizard.jsx
const STEPS = ['স্কুল তথ্য', 'শ্রেণী সেটআপ', 'শিক্ষক', 'ফি', 'সম্পন্ন']
const [step, setStep] = useState(0)

// Show progress bar
// Separate form component per step
// "পরবর্তী" বাটনে validation + API call
// "আগের ধাপ" বাটনে back
// Any step can be skipped
```

---

## Wizard Steps Per Institution Type (Revision 6)
উপরের ৫-ধাপের wizard `school`-এর জন্য। অন্য type-এ একই `Wizard.jsx` component, কিন্তু ধাপের তালিকা type অনুযায়ী (`STEPS_BY_TYPE[institution_type]`)। সব label `useTerms()` থেকে — "স্কুল", "শ্রেণী" hardcode নয়। Signup-এর সময়ই `OnboardingService::applyDefaults()` type-এর default Program/Batch/Fee category তৈরি করে রাখে (`docs/modules/institution-types.md`); wizard সেগুলো সম্পাদনা করতে দেয়।

| Step | school | college | coaching | private_batch |
|---|---|---|---|---|
| 1 | প্রতিষ্ঠানের তথ্য + লোগো + শিক্ষাবর্ষ | একই + সেশন | প্রতিষ্ঠানের তথ্য + লোগো | নিজের নাম + ফোন (লোগো ঐচ্ছিক) |
| 2 | Class ও Section (default Class 1–10 সম্পাদনা) | Class+Group ও Section (default ৬টি সম্পাদনা) | Course তৈরি + প্রতিটিতে Batch (সময়সূচি, মাসিক ফি) | প্রথম Batch (নাম, দিন-সময়, মাসিক ফি) |
| 3 | প্রথম শিক্ষক | প্রথম শিক্ষক | শিক্ষক + pay type (ঐচ্ছিক) | প্রথম Student যোগ (নাম, guardian phone) |
| 4 | Fee category | Fee category | Fee category (ভর্তি ফি, মাসিক ফি) | — |
| 5 | থিম বাছাই (free preset grid) | একই | একই | একই |
| শেষ | সম্পন্ন → Dashboard | সম্পন্ন | সম্পন্ন | সম্পন্ন (মোট ৪ ধাপ) |

"থিম বাছাই" ধাপ `POST /admin/theme/preset` call করে (`docs/THEMING.md`)। প্রতিটি ধাপ skip করা যায়; `onboarding_step` প্রতিটি ধাপ শেষে আপডেট হয় যাতে মাঝপথে ছেড়ে গেলে সেখান থেকে শুরু হয়।

## মাদ্রাসা (Revision 9)
ধরন `school` বা `college` বাছলে ফর্মে চেকবক্স "এটি মাদ্রাসা" → `terminology_preset = 'madrasa'`: শব্দ (জামাত/শাখা …) ও ভাষা (`bn, ar, en` চালু, ডিফল্ট `bn`) বসে। নতুন `institution_type` নয় (D3)। খসড়া শব্দ ও প্রিসেট: `docs/I18N.md` §১০। পরে Settings → ভাষা থেকে প্রয়োগ/সরানো। Onboarding wizard-এর ধাপ অপরিবর্তিত।

## Signup Form (Central Host)
`https://schoolapp.com/signup` — fields: প্রতিষ্ঠানের ধরন (৪টি বড় card), প্রতিষ্ঠানের নাম, পছন্দের ঠিকানা (`slug` — live availability check `GET /public/slug-check?slug=`), Admin-এর নাম, ফোন (বাধ্যতামূলক), ইমেইল (ঐচ্ছিক), password। সফল হলে `https://{slug}.schoolapp.com/login`-এ redirect।

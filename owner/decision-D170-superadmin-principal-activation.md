- **Owner approved (2026-10-27); canonical decision ও guard enablement এই packet-এর পৃথক commit-এ যোগ হবে।** এটি D89/D90-এর একটি সংকীর্ণ ব্যতিক্রম। এই draft নিজে account বা runtime বদলায় না।
# খসড়া সিদ্ধান্ত D170: Super Admin-created প্রতিষ্ঠানের প্রথম admin-এর সরাসরি activation

> **অবস্থা: প্রস্তাবিত; owner approval ও পৃথক locked-decision commit বাকি।** এটি D89/D90-এর একটি সংকীর্ণ ব্যতিক্রম প্রস্তাব করে। এই draft নিজে account, runtime, guard বা canonical decision বদলায় না।

## ১. প্রস্তাবিত সিদ্ধান্ত

### ১.১ পরিধি

- ব্যতিক্রমটি শুধু central host-এ authenticated, active Super Admin কর্তৃক তৈরি প্রতিষ্ঠানের প্রথম `admin` account-এর জন্য; registration-এর `source` অবশ্যই `super_admin` এবং review state `approved` হতে হবে।
- Public self-registration, পরের admin/staff account, rejected registration, অথবা আগে active হয়ে পরে manually deactivated account এই ব্যতিক্রমে পড়বে না। সেগুলোর D89/D90 contact-verification ও review নিয়ম অপরিবর্তিত থাকবে।
- D89/D90-এর অন্য সব শর্ত বহাল থাকবে, কেবল এই subsection-এ স্পষ্টভাবে বদলানো শর্ত ছাড়া।

### ১.২ নতুন প্রতিষ্ঠানের সরাসরি activation

- Super Admin-created institution ও তার প্রথম admin সফল creation-এর সঙ্গে সঙ্গে active হবে। এই নির্দিষ্ট path-এ contact OTP/code পাঠানো বা verify করা activation-এর পূর্বশর্ত হবে না।
- code না থাকা মানে password না থাকা নয়। Server একটি শক্তিশালী, একবার-দেখানো temporary password তৈরি করবে; Super Admin সেটি recipient-কে নিরাপদে দেবেন। প্রথম login-এই password পরিবর্তন বাধ্যতামূলক হবে।
- Temporary password শুধু সফল creation/activation response-এ একবার দেখানো যাবে; database-এ hash ছাড়া রাখা যাবে না এবং log, audit metadata, URL, analytics বা notification-এ লেখা যাবে না। Password-change policy ও সব session/token নিয়ম বহাল থাকবে।
- Activation-এর audit event-এ actor, institution, first-admin identity এবং `super_admin_provisioning` কারণ থাকবে; contact value, temporary password, OTP বা token থাকবে না। OTP verification ঘটেছে—এমন মিথ্যা record তৈরি করা যাবে না।

### ১.৩ আগে থেকে তৈরি pending account

- সিদ্ধান্ত অনুমোদনের পর Super Admin institution detail থেকে শুধু eligible pending account-এর জন্য পৃথক **“সরাসরি সক্রিয় করুন”** action পাবে। এটি সাধারণ suspend/activate toggle নয়।
- eligibility: `source=super_admin`, review `approved`, institution ও first admin এখনও inactive, এবং কোনো rejected/cancelled/previously active state নেই। Server transaction ও row lock-এর মধ্যে শর্তগুলো পুনরায় যাচাই করবে।
- action সফল হলে আগের pending activation request বাতিল/অকার্যকর হবে; server নতুন একবার-দেখানো temporary password দেবে, account ও institution active করবে এবং §১.২-এর মতো audit করবে। দ্বিতীয়বার চালালে নতুন credential তৈরি বা পুরোনো state পুনরায় সক্রিয় হবে না।
- এর আওতায় current local institution `#4` পড়বে কি না, তার record-এর eligibility check approval implementation/test-এ নিশ্চিত করবে; check না মিললে state পরিবর্তন না করে কারণ দেখাবে।
- এর আওতায় current local institution `#4` পড়বে কি না, তার record-এর eligibility check approval implementation/test-এ নিশ্চিত করবে; check না মিললে state পরিবর্তন না করে কারণ দেখাবে।

### ১.৪ টাস্ক ও ক্রম

- Implementation task ID `D170.1`; prerequisite `STW.2`। Scope: §১.২–১.৩-এর Super Admin-created first-admin activation, one-time temporary password ও password-change flow, eligibility/authorization checks, এবং tests। নতুন table বা migration নয়।
- `D170.1` শেষ হওয়ার আগে `STW.3` শুরু হবে না; guard-এ `STW.3`-এর dependency `D170.1` হবে। Implementation commits-এ `Task: D170.1` ও `Change-Request: D170` থাকবে।
### ১.৫ Admin actions এবং authorization সীমা
**Owner approval (2026-10-27):** D89/D90-এ শুধু §১-এর Super Admin-created first-admin exception যোগ করছি। One-time temporary password Super Admin-কে একবার দেখানো হবে এবং recipient প্রথম login-এ বদলাবেন। Public signup ও সব বিদ্যমান authorization boundary অপরিবর্তিত থাকবে। Current pending eligible Super Admin-created account-এ dedicated, audited action ব্যবহার করা যাবে। `D170.1` অবশ্যই `STW.2`-এর পরে এবং `STW.3`-এর আগে হবে।
এই approval সিদ্ধান্ত ও task-scope enablement-কে অনুমোদন করে; implementation নিজস্ব task commit ও acceptance checks না হওয়া পর্যন্ত কোনো account স্বয়ংক্রিয়ভাবে বদলাবে না।

### ১.৪ Admin actions এবং authorization সীমা

- Activation-এর পর admin role-এর বিদ্যমান, release-এ shipped, tenant-authorized এবং institution-এর enabled module-এ অনুমোদিত actions/buttons ব্যবহারযোগ্য হবে; account inactive থাকার কারণে আর blanket-disable থাকবে না।
- “সব action” কোনো authorization bypass নয়: role, module/feature, tenant isolation, data ownership, D33, maker-checker, locked decision এবং release gates অপরিবর্তিত থাকবে। কোনো hidden/unshipped capability বা অন্য role-এর permission যোগ হবে না।
- D47 অনুযায়ী নতুন plan/size limit, subscription বা billing behavior যোগ হবে না।

## ২. আবশ্যিক পরীক্ষা

- নতুন Super Admin-created institution: institution/admin active, OTP ছাড়াই; temporary password একবার ফেরত আসে, first login-এ change বাধ্যতামূলক, secret কোনো log/audit-এ নেই।
- Existing eligible pending institution: dedicated action ঠিক একবার সফল; retry/idempotency, stale eligibility, rejected/cancelled/previously-active cases fail closed।
- Public self-registration-এ contact verification ও explicit review এখনও বাধ্যতামূলক।
- Activation-এর পর admin UI ও API বিদ্যমান role/module/tenant checks মানে; অন্য institution বা gated/unshipped action-এ কোনো প্রবেশ হয় না।
- Institution `#4`-এর বাস্তব eligibility ও activation outcome নির্দিষ্ট integration test-এ যাচাই হবে; production/live data-তে কোনো activation নয়।

## ৩. Owner approval

**প্রস্তাবিত owner approval:** D89/D90-এ শুধু §১-এর Super Admin-created first-admin exception যোগ করছি। One-time temporary password Super Admin-কে একবার দেখানো হবে এবং recipient প্রথম login-এ বদলাবেন। Public signup ও সব বিদ্যমান authorization boundary অপরিবর্তিত থাকবে। Current pending eligible Super Admin-created account-এ dedicated, audited action ব্যবহার করা যাবে।

Owner approval/সংশোধন এবং আলাদা locked-decision commit না হওয়া পর্যন্ত এই প্রস্তাব কার্যকর নয়; implementation বা account activation অনুমোদিত নয়।
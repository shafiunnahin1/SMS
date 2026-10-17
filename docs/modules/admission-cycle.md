# Admission Cycle — ভর্তি-চক্র: পরীক্ষা, মেধা/অপেক্ষমাণ তালিকা, যাচাইযোগ্য লটারি (Revision 12)

> আবেদন (পাবলিক ফর্ম, `admission_leads`) থেকে ভর্তি পর্যন্ত একটি স্বচ্ছ, **পুনরুৎপাদনযোগ্য** নির্বাচন। টেবিল: `admission_cycles`, `admission_draws`; `admission_leads` (+`cycle_id`, `application_no`, `test_roll`, `test_marks`, `merit_rank`, `list_status`)। Module key: `admission_cycle` (core; school · college · coaching)। Roles: Admin। সিদ্ধান্ত **D37**।
> **সীমা (সততার সাথে):** (ক) **কোটা (মুক্তিযোদ্ধা, প্রতিবন্ধী ইত্যাদি) এই সংস্করণে নেই** — সরকারি/প্রতিষ্ঠানভেদে নিয়ম ও আইনি শর্ত আমি যাচাই করিনি; প্রকৃত নিয়ম পেলে আলাদা সম্প্রসারণ। (খ) একটি চক্রে একটি পরীক্ষা (মোট নম্বর এন্ট্রি); বহু-পত্র হলে মোট বসান। (গ) লটারি-নীতির আইনি স্বীকৃতি আমি যাচাই করিনি; সিস্টেম শুধু *নির্বাচনটি কেউ যাচাই করতে পারে* এটুকু নিশ্চিত করে। **D44:** সরকারি কোটা-নিয়ম ঐচ্ছিক ও নিচু অগ্রাধিকারে (পরিকল্পনা থেকে বাদ নয়); আগে বেসরকারি প্রতিষ্ঠান নিজের শর্তে ভর্তি-পরীক্ষা/মেধা-তালিকা চালায়।

## ১. অবস্থা-যন্ত্র (`admission_cycles.status`)
`draft → open → testing → listing → closed`
| অবস্থা | কী হয় |
|---|---|
| `draft` | সেটআপ: program, আসন (`seats`), আবেদনের সময়, `application_fee`, `rule` |
| `open` | আবেদন চলে। **এই মুহূর্তে লটারির commitment তৈরি** (§৩) ও পাবলিক পাতায় প্রকাশ; আবেদন-সংখ্যা বাড়ে, প্রতিটি আবেদন অনুমান-অযোগ্য `application_no` পায় |
| `testing` | আবেদন বন্ধ (freeze); ফি-পরিশোধ হলে রোল তৈরি (`test_roll`); পরীক্ষার পর `test_marks` এন্ট্রি |
| `listing` | তালিকা তৈরি (মেধা অথবা লটারি) → `merit_rank`, `list_status` |
| `closed` | ভর্তি-নিশ্চিতকরণ শেষ; বাকিরা rejected |
`rule` (JSON): `{ "mode": "merit" | "lottery", "waiting": 10, "min_marks": null, "tie_break": ["applied_at"], "confirm_within_days": 7, "publish_names": false }`। `waiting` = অপেক্ষমাণ আসন-সংখ্যা।
**যোগ্যতা:** ফি > ০ হলে ফি-পরিশোধিত; `mode=merit` হলে `test_marks` আছে ও `≥ min_marks`; অসম্পূর্ণ আবেদন তালিকায় আসে না।

## ২. মেধা-ভিত্তিক (`mode = merit`)
`test_marks` ঊর্ধ্বক্রমে নয়—**বেশি নম্বর আগে**; সমান হলে `tie_break` (ডিফল্ট: আগে আবেদনকারী)। প্রথম `seats` জন `selected`, পরের `waiting` জন `waiting`, বাকিরা `rejected`। **যাচাইকৃত:** (A: ৭৮, ক্রম ৩), (B: ৮২, ক্রম ৫), (C: ৭৮, ক্রম ১), (D: ৬৫, ক্রম ২) ⇒ B, C, A, D।

## ৩. যাচাইযোগ্য লটারি (D37) — commit → freeze → reveal
লক্ষ্য: **আয়োজকও ফলাফল বেছে নিতে পারে না, আর যে কেউ পরে নিজে মিলিয়ে দেখতে পারে।**
1. **Commit (চক্র `open` হওয়ার মুহূর্তে):** সিস্টেম ৩২-বাইটের কঠিন-র‍্যান্ডম seed বানায়, Admin-কে **একবারই** দেখায়/ডাউনলোড করায়; সার্ভার সংরক্ষণ করে শুধু `seed_commitment = SHA-256(seed)` (`admission_draws`), যা পাবলিক পাতায় প্রকাশিত। **seed সার্ভারে থাকে না।**
2. **Freeze:** `testing`-এ যাওয়ার সময় যোগ্য আবেদনকারীদের `application_no` সর্টেড তালিকার SHA-256 (`result.applicants_hash`) সংরক্ষিত ও প্রকাশিত। এরপর কেউ যোগ/বাদ হয় না।
3. **Reveal (`listing`):** Admin seed আপলোড করে; সার্ভার `SHA-256(seed) == seed_commitment` যাচাই করে (না মিললে অগ্রাহ্য)। ক্রম = `application_no`গুলোকে `HMAC-SHA256(seed, application_no)`-এর হেক্স অনুযায়ী সাজানো (ছোট আগে)। প্রথম `seats` জন selected, পরের `waiting` জন waiting, বাকিরা rejected। `seed_reveal`, `result` (`order`, `selected`, `waiting`, `applicants_hash`, `algorithm: "hmac-sha256/v1"`) সংরক্ষিত।
4. **যে কেউ যাচাই করতে পারে:** পাবলিক পাতায় commitment, প্রকাশিত seed, আবেদনকারীদের `application_no` তালিকা (নাম ছাড়া), ও ৫-লাইনের যাচাই-স্ক্রিপ্ট।
**কেন `application_no`, ক্রমিক id নয়:** id অনুমানযোগ্য — ভেতরের লোক আগে থেকে "কোন seed-এ আমার আত্মীয়ের id ওপরে আসে" খুঁজে নিতে পারত। `application_no` (যেমন `A27-7K3QF`) র‍্যান্ডম, আবেদনের মুহূর্তে তৈরি, commitment-এর **পরে** — তাই seed আগে বেছে নেওয়ার লাভ নেই।
**যাচাইকৃত গুণ (reference):** (ক) ক্রম ইনপুটের ক্রমের উপর নির্ভর করে না; (খ) দেরিতে আসা আবেদনকারী অন্যদের ক্রম বদলায় না; (গ) ভিন্ন seed ⇒ ভিন্ন ক্রম; (ঘ) **নিরপেক্ষ:** ২০ জনের ৪,০০০টি র‍্যান্ডম seed-এ প্রথম ৫-এ ওঠার সংখ্যা প্রত্যেকের ৯৪৯–১০৫২ (প্রত্যাশা ১,০০০, ৪σ-সীমা ৮৯০–১১১০), গড় অবস্থান ৯.৩৫–৯.৬৭ (প্রত্যাশা ৯.৫)।
**seed হারালে (দুর্বল বিকল্প, স্পষ্ট চিহ্নিত):** নতুন commitment তৈরি করা যায় কিন্তু freeze-এর **পরে**; তখন `result.guarantee = "weaker"` লেখা হয় ও পাবলিক পাতায় দেখায়, কারণ আয়োজক তালিকা জেনে seed বেছে নিতে পারতেন। তাই seed নিরাপদ জায়গায় (ছাপা + ডিজিটাল) রাখতে বলা হয়।

## ৪. তালিকার পর
- `list_status` (`selected|waiting|rejected|admitted|declined`); ফল SMS (প্রাপকের ভাষায়, `communication-plus.md` টেমপ্লেট `admission_result`); নিশ্চিতকরণ-সময় `confirm_within_days`।
- **অপেক্ষমাণ-উত্তরণ:** selected ছাত্র `declined` হলে বা সময় পেরোলে পরবর্তী waiting জনকে স্বয়ংক্রিয় অফার (job `admission:promote`), ক্রম অক্ষুণ্ণ। **যাচাইকৃত:** selected [a,b,c], waiting [w1,w2], b প্রত্যাখ্যান ⇒ selected [a,c,w1], waiting [w2]।
- **ভর্তি:** `selected` → ফি/কাগজ নিশ্চিত → বিদ্যমান "lead convert" (ছাত্র + enrollment) ⇒ `admitted`।
- **পাবলিক অবস্থা-খোঁজ:** `GET /public/admission/status?application_no=&phone=` — দুটোই মিলতে হবে; throttle; শুধু নিজের অবস্থা ও পরবর্তী ধাপ। পুরো তালিকা প্রকাশ `rule.publish_names=false` ডিফল্টে **শুধু application_no + অবস্থা**; নামসহ প্রকাশ প্রতিষ্ঠানের সিদ্ধান্ত।
- আবেদন-ফি অনলাইন: `docs/modules/public-website-plus.md` (`AdmissionFeeFlowTest`); ফেরত `finance-advanced.md`।

## ৫. Endpoint (`module:admission_cycle`, Admin)
```
GET|POST|PUT /admission/cycles    POST /admission/cycles/{id}/open | freeze | close
POST /admission/cycles/{id}/test-marks { rows:[{application_no,marks}] }  (বা Excel)
POST /admission/cycles/{id}/list/merit
POST /admission/cycles/{id}/list/lottery { seed }          GET /admission/cycles/{id}/draw   (আওতা: Admin; পাবলিক অংশ নিচে)
POST /admission/leads/{id}/confirm | decline | admit
GET  /public/admission/cycle/{id}/transparency            (commitment, applicants_hash, প্রকাশিত seed ও তালিকা — draw-এর পর)
GET  /public/admission/status?application_no=&phone=
```

## ৬. পরীক্ষা ও Done When
| Test | Asserts |
|---|---|
| `CommitmentTest` | SHA-256(seed) = commitment; ভুল seed 422; seed সার্ভারে কোথাও সংরক্ষিত নয় (DB/লগ/ক্যাশ) |
| `DrawReproducibleTest` | ফিক্সচারে নির্দিষ্ট ক্রম; ইনপুট-ক্রম/দেরিতে আসা আবেদনে অপরিবর্তিত |
| `DrawFairnessTest` | ২০ জন × ৪,০০০ seed — প্রত্যেকে ৪σ-সীমায় (§৩) |
| `FreezeTest` | `testing`-এর পর নতুন আবেদন 422; `applicants_hash` মেলে; পরিবর্তনে draw ব্যর্থ |
| `SeedLossFallbackTest` | নতুন commitment ⇒ `guarantee=weaker` লেখা ও পাবলিক চিহ্ন |
| `MeritTieBreakTest` | §২ উদাহরণ B,C,A,D; `min_marks` ছাঁটে |
| `WaitingPromotionTest` | §৪ উদাহরণ; সময় পেরোলে স্বয়ংক্রিয়; ক্রম অক্ষুণ্ণ |
| `CycleStateMachineTest` | অবৈধ লাফ (যেমন draft→listing) 422; পিছনে যাওয়া নেই |
| `PublicStatusPrivacyTest` | application_no+ফোন দুটোই লাগে; throttle; তালিকায় নাম ডিফল্টে নেই |
| `ApplicationNoTest` | অনুমান-অযোগ্য (র‍্যান্ডম), `UNIQUE (institution_id, application_no)` |
- **Done When:** coaching/school demo-তে ২০ আবেদন, ৫ আসন + ৩ অপেক্ষমাণ: (ক) মেধা-মোডে ক্রম হাতের হিসাবের সাথে মেলে, (খ) লটারিতে পাবলিক যাচাই-স্ক্রিপ্ট একই ক্রম দেয়, (গ) একজন প্রত্যাখ্যানে অপেক্ষমাণ উঠে আসে, (ঘ) freeze-এর পরে আবেদন আটকায়।
- **মালিকের সিদ্ধান্ত বাকি:** কোটা-নিয়ম (D44: ঐচ্ছিক — সরকারি/প্রতিষ্ঠানভেদে নিয়ম অজানা, আসল নিয়ম পেলে); লটারি স্থানীয় আইনে/নীতিতে গ্রহণযোগ্য কি; তালিকায় নাম প্রকাশ।

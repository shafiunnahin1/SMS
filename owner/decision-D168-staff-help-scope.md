# খসড়া সিদ্ধান্ত D168: প্রতিষ্ঠানের কর্মীদের (`institution_staff`) সফটওয়্যার-সহায়িকা

> এজেন্টের খসড়া — কোনো কোড লেখা হয়নি। মালিকের উত্তর §৫-এ। অনুমোদন করলে `owner\approve-D168.ps1` চালাবেন (দুটি commit: সিদ্ধান্তের সারি ও guard-এ task AI-Q4S; push করে না)।

## ১. এখনকার অবস্থা (কোড থেকে যাচাই করা)
- D166 (৬) সহায়িকা সব portal-এর জন্য; AI-Q4-এ admin, teacher, student, parent, accountant ও Super Admin পেয়েছে।
- `institution_staff` এখনো AI চ্যাটে **403** — fail closed; কোনো ফাঁক নেই, শুধু সুবিধা নেই।
- কর্মীর অধিকার role দিয়ে নয়: D90/D91 অনুযায়ী প্রতিটি অনুরোধে একটি নির্বাচিত বিভাগ (`X-Department-Id`), সেই বিভাগে সক্রিয় সদস্যপদ, আর সেখানে দায়িত্বের (duty) `permission_keys` (`DepartmentDutyPermissionService::has`)।
- route catalog-এ প্রতিটি route-এর `staff_mode`: `exact_duty_permission` (২৩০টি — একটি নির্দিষ্ট permission লাগে), `principal_only` (১০৪ — শুধু প্রধান), `preserve_nonstaff_boundary` (১৯৯ — কর্মীর জন্য নয়), বাকিগুলো নিজের-পরিচয়/শর্তসাপেক্ষ।

## ২. দুটি পথ
**ক) কর্মীর দায়িত্ব-অনুযায়ী সহায়িকা (এজেন্টের সুপারিশ)**
1. AI চ্যাটের route-গুলো (নিজের চ্যাট: তালিকা, খোলা, প্রশ্ন, মোছা, রেটিং) `institution_staff`-এর জন্য খোলা, catalog-এ নতুন D168 সারি, mode **`active_identity_self`** — নিজের চ্যাট ছাড়া কিছু নয়; `ai_assistant` মডিউল বন্ধ থাকলে চলবে না।
2. কর্মী শুধু **সহায়িকা** পান (অভিভাবক/হিসাবরক্ষকের মতো) — প্রশ্নব্যাংকের উত্তর নয়।
3. একটি নির্দেশনা কর্মীকে দেখানো হবে শুধু তখন, যখন: (ক) তার `roles`-এ `institution_staff` আছে; **এবং** (খ) নির্দেশনায় উল্লেখ করা **প্রতিটি** route catalog-এ `exact_duty_permission` এবং সেই permission কর্মীর **নির্বাচিত বিভাগে** আছে (D91-এর একই পরীক্ষা)। `principal_only`, `preserve_nonstaff_boundary`, অজানা বা catalog-এ নেই এমন route থাকলে → দেখানো হবে না (fail closed)।
4. কর্মীদের জন্য নির্দেশনা আলাদা করে লেখা ও যাচাই হবে (প্রথমে ২–৩টি, যেমন ফি আদায় বা হাজিরা — যে দায়িত্বের route আছে), একই অনুমোদন-পথে (Super Admin প্যানেল)।
5. পরীক্ষা: permission আছে → দেখায়; নেই, অন্য বিভাগে আছে, সদস্যপদ মেয়াদোত্তীর্ণ, principal-only route, মডিউল বন্ধ → দেখায় না; অন্যের চ্যাট 404।

**খ) আলাদা task-এ পিছিয়ে রাখা**
- AI-Q4 গ্রহণযোগ্য ধরা হবে `institution_staff` বাদে; কর্মীদের জন্য নতুন task (যেমন AI-Q4S) অনুমোদন না হওয়া পর্যন্ত blocked।
- কর্মী এখনকার মতো 403 পাবেন; AI-Q5 এখনই শুরু হতে পারে।

## ৩. মালিকের কাছে প্রশ্ন
1. **ক** নাকি **খ**?
2. (ক হলে) বিভাগ: শুধু **নির্বাচিত বিভাগের** permission (সুপারিশ — D91-এর সাথে একই), নাকি কর্মীর যেকোনো বিভাগের?
3. (ক হলে) প্রথম কোন ২–৩টি কাজের নির্দেশনা লিখব? (যেমন: ফি আদায়, হাজিরা, শিক্ষার্থী তথ্য দেখা)
4. AI-Q4-এর গ্রহণ: ক হলে AI-Q4 শেষ ধরা হবে staff অংশ (নতুন task trailer, `Change-Request: D168`) শেষ হলে; খ হলে এখনই।

## ৪. সিদ্ধান্তের সারি
| D168 | institution_staff software help by duty permission (follows D166 (6); D90/D91 unchanged) | Owner approved (2026-10-26). (1) The AI chat's own-chat routes (list, open, ask, delete, rate) also admit institution_staff, catalogued as active_identity_self: own chats only, `ai_assistant` module on; staff get the help guide only, never question-bank answers. (2) An approved article is shown to a staff member only if its roles include institution_staff AND every route it names is catalogued exact_duty_permission AND the staff member holds that permission in ANY of their active departments (active membership, active duty; the same rules as DepartmentDutyPermissionService). A principal_only, preserve_nonstaff_boundary, unknown or uncatalogued route hides the article (fail closed). This only decides which help text is shown; every page and action still enforces D90/D91 (selected department, X-Department-Id) as before. (3) First staff articles, verified against the pages and approved in the Super Admin panel like all others: student admission, fee collection, attendance, viewing student information. (4) Task AI-Q4S (after AI-Q4, trailers Change-Request: D166 and D168); AI-Q4 is accepted only when AI-Q4S is done, and AI-Q5 follows AI-Q4S. No new table. |

## ৫. মালিকের উত্তর (2026-10-26)
1. **ক** — দায়িত্ব-অনুযায়ী সহায়িকা।
2. কর্মীর **যেকোনো** সক্রিয় বিভাগের permission গণ্য হবে (এজেন্টের সুপারিশ ছিল শুধু নির্বাচিত বিভাগ)। এটি শুধু কোন নির্দেশনা দেখাবে তা ঠিক করে; আসল পাতা ও কাজে D91-এর নির্বাচিত বিভাগের পরীক্ষা আগের মতোই থাকে।
3. প্রথম নির্দেশনা: শিক্ষার্থী ভর্তি, ফি আদায়, হাজিরা, শিক্ষার্থীর তথ্য দেখা।
4. হ্যাঁ — AI-Q4 গৃহীত ধরা হবে staff অংশ (AI-Q4S) শেষ হলে; তারপর AI-Q5।


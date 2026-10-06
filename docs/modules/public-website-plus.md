# Public Website — Plus (Revision 11)

> `docs/modules/public-website.md`-এর সম্প্রসারণ: **গ্যালারি · নিউজ/ব্লগ · সাধারণ পেজ · শিক্ষক-প্রোফাইল · পাবলিক ইভেন্ট-ক্যালেন্ডার · ভর্তি-আবেদন-ফি অনলাইনে**। একই module key `public_site`, একই SEO-শেল, একই "পাবলিক এন্ডপয়েন্টে ছাত্রের তথ্য নয়" নীতি (D27)। নতুন সিদ্ধান্ত নেই; **D14/D24** (অনলাইন পেমেন্ট) ও **D27** (শিশুর তথ্য) মেনে।

## ১. গ্যালারি (`gallery_albums`, `gallery_items`)
- Admin অ্যালবাম বানায় (শিরোনাম, বিবরণ, ঐচ্ছিক ইভেন্ট-সংযোগ, `is_public`), ছবি আপলোড করে (jpg/png/webp, প্রতিটি ≤ ৩ MB, অ্যালবামে ≤ ২০০)।
- **শিশুর ছবির সম্মতি:** আপলোড-ফর্মে বাধ্যতামূলক চেকবক্স — "এই ছবিতে চেনা-যায় এমন শিশু থাকলে তাদের অভিভাবকের ছবি-সম্মতি (`consents.type = photo`) আছে" (`docs/legal/privacy-and-consent.md`)। চেকবক্স ছাড়া আপলোড হয় না; **সিস্টেম মুখ শনাক্ত করে না**, দায় প্রতিষ্ঠানের — এ কারণে লেখাটি স্পষ্ট দেখানো হয়।
- সার্ভার ছবি **পুনঃএনকোড** করে (EXIF/GPS মুছে যায়), আকার ছোট করে (সর্বোচ্চ ১৬০০px, থাম্বনেইল ৪০০px), অনন্য ফাইলনাম (UUID)। শুধু `public` disk (লোগো/hero-র মতো); ছাত্রের নথি/ছবির `private` নীতি অপরিবর্তিত।
- ক্যাপশনে ছাত্রের নাম নয় — নীতি-সতর্কতা দেখানো (বাধা নয়, Admin-এর দায়)।
- অ্যাক্সেস: Admin। মুছলে ফাইলও মোছা (soft নয়)।

## ২. নিউজ ও সাধারণ পেজ (`site_posts`)
- `type = news | page`; `slug` (`UNIQUE (institution_id, type, slug)`; a–z 0–9 `-`, বাংলা slug নয় — URL-এ percent-encoding ঝামেলা এড়াতে স্বয়ংক্রিয় latin-নাম, সম্পাদনযোগ্য)।
- **বডি = সীমিত Markdown, কখনো কাঁচা HTML নয়।** অনুমোদিত: শিরোনাম (`##`, `###`), **গাঢ়**, *ইটালিক*, তালিকা, লিঙ্ক (শুধু `http/https`; `rel="nofollow noopener"`; বাইরের লিঙ্কে নতুন ট্যাব), অনুচ্ছেদ, ছবি (**শুধু নিজের গ্যালারি থেকে**)। সার্ভার রেন্ডার ও sanitize করে; ফ্রন্টএন্ডে `dangerouslySetInnerHTML` নয়, প্রস্তুত HTML-ও নয় — সার্ভার-থেকে-আসা নিরাপদ বিষয়বস্তু-ট্রি (`blocks[]`) পাঠায়, React টাইপ-ভিত্তিক রেন্ডার করে (`docs/SECURITY.md` XSS-নীতি)।
- `news`: `published_at` ভবিষ্যৎ হলে নির্ধারিত প্রকাশ; তালিকায় পেজিনেশন (১০/পাতা)।
- `page` (যেমন "আমাদের সম্পর্কে", "ভর্তির নিয়ম", "যোগাযোগ"): `show_in_menu` + `sort_order`।
- Draft শুধু Admin দেখে; `published` সবাই (কোনো লগইন নয়)।
- সীমা: প্রতিষ্ঠানে ≤ ৫০টি page, ≤ ২০০টি news (নিয়ন্ত্রণহীন বৃদ্ধি ঠেকাতে)।

## ৩. শিক্ষক-প্রোফাইল (পাবলিক)
- `teachers.show_public` (ডিফল্ট **০**), `public_bio`। শিক্ষক নিজে (বা Admin শিক্ষকের লিখিত সম্মতিতে) চালু করে; **সম্মতি ছাড়া কেউ পাবলিক হয় না**।
- পাবলিক এন্ডপয়েন্ট শুধু: নাম, পদবি, বিষয়সমূহ, `public_bio`, ছবি (শিক্ষক নিজে ছবি-সম্মতি দিলে)। **ফোন, ইমেইল, বেতন, ঠিকানা, ID কখনো নয়।**
- ছাত্র-সংক্রান্ত কিছু নয়।

## ৪. পাবলিক ইভেন্ট-ক্যালেন্ডার
`institution_events.is_public` (ডিফল্ট ০)। পাবলিক তালিকা: শিরোনাম, তারিখ/সময়, স্থান, বিবরণ। নিবন্ধিত অংশগ্রহণকারী বা ফলাফল (`event_results`) **কখনো পাবলিক নয়**।

## ৫. ভর্তি-আবেদনের ফি অনলাইনে
### ৫.১ প্রবাহ
```
আবেদন জমা (বিদ্যমান PublicAdmissionController::store) → lead তৈরি + একটি lead_token (HMAC(lead_id|সময়), ২৪ ঘণ্টা) ফেরত
→ "আবেদন-ফি দিন" (ফি = admission_cycles.application_fee, নইলে settings.public_site.application_fee; সার্ভার ঠিক করে)
→ POST /api/v1/public/admission/{lead_id}/pay { lead_token, gateway }   → বিদ্যমান gateway-redirect (D24 registry)
→ callback/notify (সাধারণ /fees/payment/{gateway}/notify) → OnlinePaymentService::finalize() → purpose = admission_fee শাখা
→ lead_payments সারি + রসিদ APP-YYYY-nnnnn → "আবেদন-ফি পরিশোধিত" (lead-তে চিহ্ন)
```
### ৫.২ নিয়ম
- **ক্লায়েন্ট কখনো অঙ্ক পাঠায় না।** ফি সার্ভার নির্ধারণ করে; ফি ০ হলে এই ধাপ বাদ।
- অননুমোদিত lead-ID অনুমান ঠেকাতে `lead_token` বাধ্যতামূলক (সময়-সীমিত, lead-বিশেষ); ভুল/মেয়াদ-উত্তীর্ণ → 403 (অস্তিত্ব ফাঁস নেই)।
- rate limit: ৫ initiate/ঘণ্টা/IP, ৩/lead; honeypot ক্ষেত্র; **CAPTCHA** চাইলে প্রদানকারী-নির্ভর (`TODO(OD-captcha)` — আমি কোনো বিক্রেতা বা তাদের API ধরিনি)।
- `online_payments.purpose = 'admission_fee'`, `lead_id` সেট, `student_id`/`parent_user_id` **NULL** (স্কিমা এই ধাপে সেভাবে বদলানো)। বাকি সব (gateway_ref, `review` স্থিতি, idempotent notify, settlement) অপরিবর্তিত।
- **রসিদ:** `lead_payments.receipt_no` (`APP-`, `UNIQUE (institution_id, receipt_no)`, transaction + institution lock); পাবলিক রসিদ-লিঙ্ক signed ও সময়-সীমিত, শুধু নাম ও অঙ্ক।
- **ফেরত:** আবেদন-ফি ফেরত এই সংস্করণে ম্যানুয়াল (gateway-পোর্টালে) ও রেকর্ডে নোট; `fee_refunds` ছাত্র-ভিত্তিক বলে প্রযোজ্য নয়। (সীমা, §৯)
- আবেদনকারী ভর্তি হলে (`convert`) `lead_payments` ছাত্রের প্রোফাইলে "আবেদন-ফি দেওয়া হয়েছে" হিসেবে দেখায়; **নিয়মিত ফি থেকে সমন্বয় স্বয়ংক্রিয় নয়** (প্রতিষ্ঠান ফি-ছাড় হিসেবে হাতে দিতে পারে)।

## ৬. SEO ও পাবলিক API
- `sitemap.xml`-এ যোগ: প্রকাশিত news/page, পাবলিক অ্যালবাম, পাবলিক ইভেন্ট, পাবলিক শিক্ষক-তালিকা। `robots.txt` অপরিবর্তিত। `<html lang dir>` I18N-অনুযায়ী; ডিফল্ট-ভাষাই ইন্ডেক্সযোগ্য (`docs/I18N.md` §৯)।
- ছোট JSON-LD (`EducationalOrganization`: নাম, URL, লোগো, ঠিকানা) শেল-এ — কোনো ব্যক্তিগত তথ্য নয়।
```
GET  /api/v1/public/gallery            /public/gallery/{album_id}
GET  /api/v1/public/news               /public/news/{slug}         GET /public/pages/{slug}
GET  /api/v1/public/teachers           GET /public/events
POST /api/v1/public/admission/{lead_id}/pay   { lead_token, gateway }
# Admin: GET|POST|PUT|DELETE /admin/site/albums · /albums/{id}/items (upload) · /admin/site/posts · PATCH /admin/site/teachers/{id}/public · PATCH /admin/events/{id}/public
```
`/bootstrap` পাবলিক-allow-list অপরিবর্তিত; নতুন ডেটা শুধু উপরের পাবলিক এন্ডপয়েন্টে।

## ৭. Admin UI
`/admin/settings/website` এখন ট্যাব: সাধারণ · গ্যালারি · নিউজ · পেজ · শিক্ষক · ইভেন্ট · আবেদন-ফি। পূর্বরূপ বোতাম (draft দেখা)।

## ৮. ফ্রন্টএন্ড
পাবলিক পাতা সাধারণ `PublicLayout` (theme-token, RTL-সক্ষম, `LanguageSwitcher`); গ্যালারি lightbox কীবোর্ডে চলে (←/→, Esc; RTL-এ দিক উল্টো), lazy-load ছবি `loading="lazy"` ও `alt` (ক্যাপশন থেকে)।

## ৯. পরীক্ষা (`tests/Feature/PublicSite/`)
| Test | Asserts |
|---|---|
| `GalleryConsentTest` | চেকবক্স ছাড়া আপলোড 422; EXIF/GPS মোছা (পুনঃএনকোড); UUID-নাম; ≤ ৩ MB; অন্য প্রতিষ্ঠানের অ্যালবাম 404 |
| `MarkdownSanitizeTest` | `<script>`, `onerror`, `javascript:` লিঙ্ক, বাইরের ছবি, কাঁচা HTML — সবই বাদ/নিষ্ক্রিয়; অনুমোদিত উপাদান থাকে |
| `PostVisibilityTest` | draft পাবলিকে নয়; ভবিষ্যৎ `published_at` লুকানো; slug অনন্য per (প্রতিষ্ঠান, type) |
| `PublicTeacherTest` | ডিফল্টে কেউ পাবলিক নয়; ফোন/ইমেইল/বেতন কখনো রেসপন্সে নেই |
| `PublicNoStudentDataTest` | কোনো পাবলিক এন্ডপয়েন্টে ছাত্র/ফলাফল/অংশগ্রহণকারী তথ্য নেই (রেসপন্স-কী allow-list) |
| `AdmissionFeeFlowTest` | token ছাড়া/ভুল token 403; ক্লায়েন্টের পাঠানো `amount` উপেক্ষিত; ফি ০ হলে ধাপ বাদ |
| `AdmissionFeeFinalizeTest` | notify দুবার → `lead_payments` একটি; রসিদ `APP-` অনন্য; `review` স্থিতি অপরিবর্তিত আচরণ; `student_id` NULL গ্রহণযোগ্য |
| `AdmissionFeeRateLimitTest` | ৬ষ্ঠ initiate/ঘণ্টা 429; honeypot পূরণে নীরব প্রত্যাখ্যান |
| `SitemapPlusTest` | নতুন বিষয়বস্তু sitemap-এ; draft/অ-পাবলিক নেই |

## ১০. Done When
- [ ] ছবি-সম্মতি-চেকসহ অ্যালবাম, থাম্বনেইল, lightbox (LTR ও RTL-এ)
- [ ] Markdown-এ ইনজেকশন-প্রচেষ্টা কিছুই ঘটায় না; প্রকাশিত news ও page পাবলিকে SEO-সহ দেখা যায়
- [ ] শিক্ষক সম্মতি দিলে তবেই পাবলিক; ফোন/ইমেইল দেখা যায় না
- [ ] টেস্ট-gateway-তে আবেদন-ফি: token → pay → notify → `APP-` রসিদ; দ্বিতীয় notify কিছু বদলায় না

## ১১. সীমা
CAPTCHA, ছবিতে স্বয়ংক্রিয় মুখ-শনাক্তকরণ/ঝাপসা করা, ভিডিও গ্যালারি, মন্তব্য/ফর্ম-সাবমিশন (যোগাযোগ-ফর্ম ছাড়া), বহুভাষা-বিষয়বস্তু (news-এর অনুবাদ) — এই সংস্করণে নেই; বিষয়বস্তু লেখা-ভাষাতেই দেখায় (`docs/I18N.md` §২)।

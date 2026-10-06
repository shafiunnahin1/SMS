# Multi-Tenancy Design (Revision 6)

## Approach: Single Database + institution_id
সব tenant-scoped টেবিলে `institution_id` কলাম; `BelongsToInstitution` trait global scope দিয়ে প্রতিটি query স্বয়ংক্রিয়ভাবে filter করে এবং create-এ `institution_id` বসায়। Trait-এর সম্পূর্ণ code: `docs/templates/laravel-core-files.md`।

## Tenant = Institution (Four Types)
`institutions.institution_type`: `school | college | coaching | private_batch`। Type কী নিয়ন্ত্রণ করে: `docs/modules/institution-types.md`।

## How a Request Finds Its Tenant
1. `TenantMiddleware` request-এর `Host` নেয় (অন্য কোনো header নয়)।
2. Host `CENTRAL_DOMAINS`-এ থাকলে → কোনো tenant bind হয় না (landing, signup, Super Admin panel)।
3. Host `{slug}.APP_BASE_DOMAIN` হলে → `institutions.slug`।
4. অন্য যেকোনো host → `institution_domains.domain` যেখানে `status = active`।
5. না পেলে `404 institution_not_found`; `suspended` হলে `403 institution_suspended`।
6. পাওয়া গেলে tenant বাঁধা হয় (`TenantMiddleware`) এবং response-এর পরে `terminate()` সেটি **ছেড়ে দেয়**।

Code: `TenantMiddleware`, `TenantResolver`, `config/tenancy.php` — `docs/templates/laravel-core-files.md`।

## Isolation Rules
- Login-এর পর প্রতিটি authenticated request-এ `user.institution_id === currentInstitution.id` যাচাই (`RoleMiddleware`-এ আছে) — অন্য tenant-এর token দিয়ে অন্য host-এ ঢোকা যায় না।
- `super_admin`-এর `institution_id = NULL`; শুধু `SUPER_ADMIN_DOMAIN`-এ কাজ করে, যেখানে কোনো tenant scope নেই।
- **Fail-closed (Revision 7):** tenant-scoped model-এ tenant বাঁধা না থাকলে query exception (`TenantNotBoundException`), আগের মতো চুপচাপ সব প্রতিষ্ঠানের ডেটা নয়। সব-tenant দেখা/নির্দিষ্ট tenant হিসেবে চলা শুধু `Tenancy::withoutTenancy()` / `::as()` / `::each()` / `->anyInstitution()` দিয়ে, নাম লিখে — `docs/templates/laravel-core-files.md` "Tenant Isolation, Fail-Closed"। `app()->instance('currentInstitution', …)` অ্যাপ-কোডে নিষেধ (শুধু `TenantMiddleware`)।
- Queue job: constructor-এ `institutionId`, `TenantAwareJob` trait (`BindTenant` middleware প্রতিটি job-কে `Tenancy::as()`-এর ভেতরে চালায় ও শেষে ফিরিয়ে দেয়) — দীর্ঘস্থায়ী worker-এ আগের job-এর tenant পরের job-এ থেকে যাওয়া আটকায়। Scheduler/console: `Tenancy::each()`।
- `users` ও `audit_logs`-এর `institution_id` NULL হতে পারে (Super Admin), তাই ওদের trait আলাদা: `User` কোনো global scope পায় না, কিন্তু `User::inTenant()` (fail-closed) ও `User::platform()` scope দিয়েই পড়তে হয়; `AuditLog` `BelongsToOptionalInstitution`।
- Cache key-তে সবসময় `institution_id` থাকে (`docs/architecture/redis-cache-strategy.md`)।
- Unique business code (student ID, receipt no, employee ID, TC no) প্রতিষ্ঠানভিত্তিক unique — global নয়।
- File storage path: `institutions/{institution_id}/...`।

## Domains
Default subdomain, slug পরিবর্তন, custom domain, SSL, DNS নির্দেশিকা — সব `docs/modules/custom-domain.md`-এ। `institutions` টেবিলে কোনো domain কলাম নেই (শুধু `slug`)।

## Test
`TenantIsolationTest` (সবচেয়ে গুরুত্বপূর্ণ) ও `docs/modules/custom-domain.md`-এর Part G-র test গুলো — `docs/TESTING.md`।

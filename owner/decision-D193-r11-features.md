# খসড়া সিদ্ধান্ত D193 — R1.1-এর বাকি ছয়টি ফিচার, ক্রমে (runtime R3-এর ভিতরে)

> এজেন্টের খসড়া (2026-11-07)। মালিক "সব ক্রমে" বলেছেন। `owner/approve-D193.ps1` মালিক চালাবেন (এজেন্ট নয়): সারি যোগ + guard-এ ছয়টি টাস্ক ও তাদের টেবিল। দুই commit; পুশ নয়।

## কী, কোন ক্রমে (প্রতিটি আগেরটি `[x]` হলে শুরু)
| টাস্ক | ফিচার | মডিউল-কী | স্পেক | টেবিল |
|---|---|---|---|---|
| NTC.1 | নোটিশ বোর্ড (প্রকাশ, লক্ষ্য-দল, পড়েছে-চিহ্ন, ঐচ্ছিক SMS) | `notices` | `docs/modules/notifications.md` (notice board), `communication-plus.md` (acknowledge) | `notices`, `notice_receipts` |
| ADM.1 | প্রবেশপত্র + ID কার্ড (PDF) | `admit_card`, `id_cards` | `advanced-features.md` (admit card), `pdf-reports.md`, `extended-features.md` (ID card) | `exams` (admit-card কলাম) |
| RTN.1 | ক্লাস-রুটিন (স্লট, শিক্ষক/কক্ষ-সংঘর্ষ, শিক্ষকের ও আজকের রুটিন, PDF) | `routine` | `routine.md`, `teacher-subjects.md` | `routines` |
| SUP.1 | সাপোর্ট টিকিট (প্রতিষ্ঠান ↔ প্ল্যাটফর্ম) | `support` | `platform-ops.md` §১ | `support_tickets`, `support_ticket_messages` |
| MIG.1 | ডেটা-মাইগ্রেশন উইজার্ড: teachers, fee_structure, fee_history, results, attendance (dry-run, rollback) | `data_migration` (import_kinds বাড়ে) | `data-migration.md` | `import_jobs`, `import_rows` |
| EXP.1 | প্রতিষ্ঠানের ডেটা export / নতুন হিসেবে import (D38) | — (Super Admin / CLI) | `platform-ops.md` §৬, Step 8.4 | `tenant_exports` |

## প্রস্তাবিত সারি
| D193 | R1.1 remaining features, in order, inside runtime R3 | Owner approved (2026-11-07). The remaining R1.1 features are built in this order, each task after the previous one is `[x]`: NTC.1 notice board (`notices`; `notices`, `notice_receipts`), ADM.1 admit card and ID cards (`admit_card`, `id_cards`; the admit-card columns of `exams`), RTN.1 class routine (`routine`; `routines`), SUP.1 support tickets (`support`; `support_tickets`, `support_ticket_messages`), MIG.1 data-migration wizard kinds teachers, fee_structure, fee_history, results, attendance (`data_migration`, `import_jobs`, `import_rows`, the release `import_kinds`), EXP.1 tenant export / import-as-new (D38; `tenant_exports`). Each follows its existing spec file only (docs/modules/notifications.md, communication-plus.md, advanced-features.md, pdf-reports.md, extended-features.md, routine.md, teacher-subjects.md, platform-ops.md, data-migration.md); no new table, column, route or package beyond those specs. A task that ships a module key adds it to `api/config/release.php` together with `docs/release/r3-scope.json` `release_php.modules` and the `docs/RELEASE-3.md` sample (commit trailers `Release: R3` and `Change-Request: D193`); the release id stays R3. Paid-module rules of D187 apply to the new keys (`support`, `data_migration` stay free). Commits carry `Change-Request: D193`; every task's Done-When includes `php artisan test`, `npx vitest run`, `npm run lint:theme`, its own new tests and `verify.py . --deep`. |

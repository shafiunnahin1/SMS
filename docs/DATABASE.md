# DATABASE

**একমাত্র সত্য: `docs/database/schema.sql`** (187টি deployed/operational টেবিল)। কোনো module-ডক্সে ভিন্ন কলাম দেখলে schema.sql ঠিক (D13)। migration-ক্রম: `docs/database/migrations.md`। seed: `docs/database/seeders.md`।

## নিয়মগুলো (সংক্ষেপে; Cursor-এ `.cursor/rules/database.mdc`)
1. **Tenant কলাম:** প্রতিটি tenant-ডেটার টেবিলে `institution_id BIGINT UNSIGNED NOT NULL` + FK। ব্যতিক্রম (৬টি + প্রশ্নব্যাংকের ৩৩টি): `subscription_plans`, `institutions`, `otp_tokens`, `theme_presets`, `coupons`, `platform_settings`, `qb_class_levels`, `qb_subjects`, `qb_class_level_subject`, `qb_chapters`, `qb_chapter_class_level`, `qb_topics`, `qb_question_types`, `qb_questions`, `qb_question_options`, `qb_creative_parts`, `qb_question_stimuli`, `qb_question_items`, `qb_question_class_level`, `qb_question_occurrences`, `qb_question_revisions`, `qb_media`, `qb_media_links`, `qb_concepts`, `qb_resources`, `qb_prices`, `qb_price_rules`, `qb_writer_earnings`, `qb_writer_wallets`, `qb_writer_wallet_txns`, `qb_withdrawal_requests`, `qb_quiz_packages`, `qb_quizzes`, `qb_quiz_questions`, `qb_import_map`, `qb_graph_datasets`, `qb_curriculum_versions`, `qb_curriculum_nodes`, `qb_question_curriculum_nodes` (প্ল্যাটফর্ম-স্তর; মডেল `Coupon`, `PlatformSetting`; `qb_*` = D65/D115/D139-এর প্ল্যাটফর্ম-কনটেন্ট, মডেলে `PlatformCatalogue` — `docs/modules/question-bank.md` §২)। `users` ও `audit_logs`-এ NULL মান বৈধ (Super Admin/প্ল্যাটফর্ম)। `verify.py` এই তালিকা স্কিমার সাথে মেলায়।
2. **Unique প্রতিষ্ঠানভিত্তিক (D12):** `student_id`, `employee_id`, `receipt_no`+`line_no`, `tc_number`, `certificate_no`, `users.email/phone/username` — সব `UNIQUE (institution_id, …)`; কখনো গ্লোবাল নয়।
3. **NULL-নিরাপদ UNIQUE:** MySQL `UNIQUE`-এ NULL-কে আলাদা ধরে। তাই যেসব key-তে ঐচ্ছিক কলাম আছে তাতে `NOT NULL DEFAULT 0` (`fee_structures.batch_id`/`academic_year_id`, `batch_teachers.subject_id`, `teacher_payouts.batch_id`)।
4. **সম্প্রসারণযোগ্য মান = VARCHAR, ENUM নয়:** `gateway`, `payment_method`, `consents.type`, `online_payments.flow`, `ui_pack`, `users.locale`, `sms_logs.encoding`। ENUM শুধু স্থির বদ্ধ সেটে (status, role, gender)।
5. **Money:** `DECIMAL(10,2)` (বড় যোগফলে `(12,2)`); float নয়। অঙ্ক সার্ভারে হিসাব।
6. **JSON কলাম:** `settings`, `terminology`, `enabled_modules`, `theme_tokens`, `schedule`, `components`, `items` — model-এ `array` cast; কোয়েরি-করা মান কলামে রাখুন, JSON-এ নয়।
7. **Soft delete (`deleted_at`):** `students`, `teachers`, `staff_members`, `users`, `notices`, `homeworks`, `class_materials`। বাকি hard delete বা status।
8. **Cache কলাম:** `students.program_id/batch_id/roll_no` কেবল `EnrollmentService` লেখে (D4)। `$fillable`-এ নেই।
9. **গোপন মান:** `institution_payment_gateways.credentials`, `institution_payout_accounts.account_number`, `salary_pay_accounts.account_number` — `encrypted` cast; কখনো API/লগে নয়।
10. **Framework টেবিল schema.sql-এ নেই:** `personal_access_tokens` (+`device`, `ip_hash`), `notifications`, `jobs`, `failed_jobs` — artisan দিয়ে (`docs/database/migrations.md`)।
11. **Index:** composite `(institution_id, …)` সর্বদা আগে `institution_id`; তালিকা-ফিল্টারের কলামে index। N+1 এড়াতে `with()`; ভারী রিপোর্ট ইনডেক্সসহ।
12. **Migration:** একটি টেবিল = একটি `create_*` migration; `schema.sql`-এর পরবর্তী `ALTER` গুলো মূল `create` migration-এই মিশে যায় (ব্যতিক্রম `migrations.md`-এ নাম-ধরা)। কখনো production-এ `migrate:fresh` নয়।

## টেবিল-গ্রুপ (সব 186টি — এই তালিকা স্ক্রিপ্টে schema.sql-এর সাথে মেলানো)
| গ্রুপ | সংখ্যা | টেবিল | নোট |
|---|---|---|---|
| প্ল্যাটফর্ম ও tenant | 16 | `subscription_plans`, `institutions`, `payments`, `subscription_invoices`, `institution_theme_logs`, `theme_presets`, `institution_domains`, `ai_usage_logs`, `otp_tokens`, `support_tickets`, `support_ticket_messages`, `coupons`, `coupon_redemptions`, `platform_settings`, `impersonation_sessions`, `tenant_exports` | `institutions` = tenant। `coupons`, `platform_settings` প্ল্যাটফর্ম-স্তরের (`institution_id` নেই)। `payments`/`subscription_invoices` = প্রতিষ্ঠান → প্ল্যাটফর্ম (কর/ছাড়/credit-note কলামসহ) |
| ব্যবহারকারী ও প্রবেশাধিকার | 4 | `users`, `parent_student`, `audit_logs`, `consents` | `users.institution_id` NULL = Super Admin; `users.locale`, `name_alt`, `ui_preferences` |
| principal review ও activation (D90) | 2 | `institution_registrations`, `account_activation_requests` | Tenant/user composite identity; no portable review/challenge proof; exclude export/backup and purge before referenced auth rows |
| বিভাগ ও staff অনুমোদন (D88) | 5 | `institution_departments`, `department_memberships`, `department_duties`, `department_duty_assignments`, `staff_mapping_reviews` | R3.6a foundation; R3.6b enforcement; memberships use User identity and duties grant only catalogued permissions; D101 append-only reviewed legacy mapping |
| একাডেমিক কাঠামো | 11 | `academic_years`, `programs`, `batches`, `enrollments`, `subjects`, `teacher_subjects`, `batch_teachers`, `holidays`, `routines`, `routine_blocks`, `substitutions` | `enrollments` = সদস্যপদের সত্য (D4); `batches.shift`; রুটিন-সংঘর্ষ service-এ |
| মানুষ | 7 | `students`, `teachers`, `student_documents`, `alumni`, `student_import_logs`, `training_programs`, `teacher_trainings` | `students.program_id/batch_id/roll_no` = cache; `deleted_at`, `anonymized_at` |
| হাজিরা, পরীক্ষা, ফলাফল | 17 | `attendances`, `archived_attendances`, `period_attendances`, `student_leave_requests`, `exams`, `exam_subjects`, `results`, `report_card_summaries`, `result_sheets`, `final_results`, `exam_seat_plans`, `online_exams`, `exam_questions`, `exam_attempts`, `behavior_logs`, `student_health_records`, `risk_flags` | পরীক্ষাভেদে পূর্ণমান `exam_subjects`-এ; ওজনযুক্ত ফলাফল `result_sheets`→`final_results`; `risk_flags` নিয়ম-ভিত্তিক সতর্কতা |
| ফি ও টাকা | 17 | `fee_categories`, `fee_structures`, `fee_payments`, `fee_waivers`, `fee_installment_plans`, `fee_installments`, `due_block_exemptions`, `fee_refunds`, `cash_book_closings`, `expenses`, `online_payments`, `institution_payment_gateways`, `institution_payout_accounts`, `settlements`, `teacher_payouts`, `scholarships`, `scholarship_applications` | `fee_payments` unique `(institution_id, receipt_no, line_no)`; reversal = ঋণাত্মক লাইন (D32); gateway-কলাম VARCHAR (D24) |
| হিসাব-খাতা ও দান | 9 | `ledger_accounts`, `vouchers`, `voucher_lines`, `budgets`, `budget_lines`, `donors`, `donation_funds`, `donation_campaigns`, `donations` | ডবল-এন্ট্রি; পোস্ট-করা ভাউচার অপরিবর্তনীয় (reversal দিয়ে সংশোধন); `restricted` তহবিল ঋণাত্মক হতে পারে না |
| HR, বেতন ও payroll | 16 | `staff_members`, `staff_attendances`, `teacher_attendances`, `leave_types`, `leave_applications`, `salary_components`, `salary_structures`, `salary_structure_lines`, `salary_revisions`, `salary_adjustments`, `bonus_schemes`, `salary_advances`, `salary_pay_accounts`, `payroll_runs`, `payroll_items`, `provident_fund_entries` | `payee_type`+`payee_id` FK ছাড়া জোড়া; অনুমোদিত run ফ্রিজ (D32/D33) |
| যোগাযোগ | 8 | `notices`, `notice_receipts`, `messages`, `sms_logs`, `sms_credit_transactions`, `sms_templates`, `sms_campaigns`, `parent_meetings` | SMS: sender, credit, অংশ-গণনা, delivery-status, টেমপ্লেট, ক্যাম্পেইন; নোটিশ-স্বীকৃতি |
| ভর্তি ও পাবলিক সাইট | 7 | `admission_leads`, `admission_cycles`, `admission_draws`, `lead_payments`, `gallery_albums`, `gallery_items`, `site_posts` | ভর্তি-চক্র, commit-reveal লটারি, আবেদন-ফি; গ্যালারি/নিউজ/পেজ |
| শেখা | 8 | `homeworks`, `homework_submissions`, `class_materials`, `online_classes`, `syllabus_units`, `lesson_plans`, `syllabus_coverage`, `hifz_records` | `batch_id` NULL = পুরো program (Targeting Rule); `hifz_records` opt-in মডিউল |
| ক্যাম্পাস, স্টোর, device | 15 | `books`, `book_issues`, `vehicles`, `transport_routes`, `route_stops`, `student_transport`, `vehicle_locations`, `hostels`, `hostel_rooms`, `hostel_allocations`, `inventory_items`, `inventory_movements`, `attendance_devices`, `person_credentials`, `device_punches` | `inventory_items.stock` = ledger-এর cache; biometric template কখনো সংরক্ষিত নয় (D35) |
| সনদ, ইভেন্ট, ভিজিটর | 6 | `certificates`, `tc_certificates`, `visitor_logs`, `institution_events`, `event_registrations`, `event_results` | `verify_code` দিয়ে পাবলিক যাচাই |
| ডেটা আমদানি | 2 | `import_jobs`, `import_rows` | প্রতিটি সারি কী তৈরি করেছে তা রাখে — rollback শুধু সেটুকু মোছে |
| প্রশ্নব্যাংক ও কুইজ (D65/D66, D69, D115, D139) | 41 | `qb_class_levels`, `qb_subjects`, `qb_class_level_subject`, `qb_chapters`, `qb_chapter_class_level`, `qb_topics`, `qb_question_types`, `qb_questions`, `qb_question_options`, `qb_creative_parts`, `qb_question_stimuli`, `qb_question_items`, `qb_question_class_level`, `qb_question_occurrences`, `qb_question_revisions`, `qb_media`, `qb_media_links`, `qb_concepts`, `qb_resources`, `qb_prices`, `qb_price_rules`, `qb_unlocks`, `qb_student_orders`, `qb_student_unlocks`, `qb_writer_earnings`, `qb_writer_wallets`, `qb_writer_wallet_txns`, `qb_withdrawal_requests`, `qb_papers`, `qb_paper_sections`, `qb_paper_items`, `qb_quiz_packages`, `qb_quizzes`, `qb_quiz_questions`, `qb_student_package_access`, `qb_quiz_attempts`, `qb_import_map`, `qb_graph_datasets`, `qb_curriculum_versions`, `qb_curriculum_nodes`, `qb_question_curriculum_nodes` | পাঠ্যক্রম, প্রশ্ন, কনসেপ্ট, রিসোর্স, দাম ও প্রশ্ন-ধরনের নিয়ম = প্ল্যাটফর্ম-কনটেন্ট (`institution_id` নেই, `PlatformCatalogue`); কেনা, প্রশ্নপত্র, কুইজ-চেষ্টা = প্রতিষ্ঠানের (`docs/modules/question-bank.md`) |

## সম্পর্কের মূল চিত্র
```
institutions ─┬─ users ─┬─ students ─── enrollments ─── batches ─── programs
              │         │      │             │                │
              │         │      ├─ attendances (batch_id)       └─ batch_teachers ─ teachers
              │         │      ├─ results ─ exam_subjects ─ exams
              │         │      ├─ fee_payments (enrollment_id, receipt_no, line_no) ─ online_payments ─ settlements
              │         │      └─ consents, parent_student ─ users(parent)
              │         └─ teachers
              ├─ institution_domains · theme_presets(institutions.theme_preset_id) · institution_payment_gateways · institution_payout_accounts
              └─ subscription_plans(subscription_plan_id) ─ payments, subscription_invoices
```

- **Polymorphic payee:** `salary_*`/`payroll_*`/`provident_fund_entries` এ `payee_type` (`teacher`|`staff`) + `payee_id` — FK নেই; বৈধতা service-এ, tenant-scope trait-এ, এবং purge/anonymize তালিকায় আচ্ছাদিত।

## কাজের সময় যা মনে রাখবেন
- নতুন টেবিল: ১) `schema.sql`-এ, ২) `migrations.md`-এর তালিকায়, ৩) tenant model হলে `BelongsToInstitution`, ৪) `TenantPurgeTest`-এর তালিকায় (purge ক্রম — নইলে প্রতিষ্ঠান মুছলে এ টেবিলের ডেটা পড়ে থাকবে), ৫) এই গ্রুপ-তালিকায়।
- নতুন কলাম: schema.sql ও সংশ্লিষ্ট module-ডক একসাথে; `docs/database/schema.sql` ছাড়া শুধু module-ডকে কলাম নয়।
- Seed: `docs/database/seeders.md` — তিন demo tenant (school, coaching, private_batch)।

## Design-only tables (D98/D99)

`leave_substitution_slots`, `leave_substitution_events`, `leave_substitution_operations` are canonical design definitions only. They are not deployed/migrated tables, operational export/import data or an executable task. No migration/backfill is authorized. D98/D99 inventory markers preserve full SQL/FK validation while keeping these definitions outside operational inventories. Runtime/dependency acceptance remains pending.

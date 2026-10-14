# Database Migration Order

## Migration Dependency Order
Foreign key dependency অনুযায়ী সঠিক ক্রম:

```bash
# Step 1: SaaS Layer (no dependencies)
php artisan make:migration create_subscription_plans_table
php artisan make:migration create_institutions_table
php artisan make:migration create_payments_table

# Step 2: Core (depends on institutions)
php artisan make:migration create_users_table
php artisan make:migration create_programs_table

# Step 3: Academic (depends on programs + users)
php artisan make:migration create_batches_table
php artisan make:migration create_teachers_table
php artisan make:migration create_subjects_table
php artisan make:migration create_students_table

# Step 4: Academic Activities (depends on students + teachers)
php artisan make:migration create_routines_table
php artisan make:migration create_exams_table
php artisan make:migration create_results_table
php artisan make:migration create_attendances_table
php artisan make:migration create_homeworks_table

# Step 5: Financial (depends on students + teachers)
php artisan make:migration create_fee_categories_table
php artisan make:migration create_fee_payments_table
php artisan make:migration create_expenses_table
# (R10) the old salary-payments migration was REMOVED - replaced by payroll_runs + payroll_items below
php artisan make:migration create_leave_applications_table

# Step 6: Communication (depends on users)
php artisan make:migration create_notices_table
php artisan make:migration create_messages_table
php artisan make:migration create_sms_logs_table
php artisan make:migration create_audit_logs_table

# Step 7: Extra Modules
php artisan make:migration create_books_table
php artisan make:migration create_book_issues_table
php artisan make:migration create_vehicles_table
php artisan make:migration create_transport_routes_table
php artisan make:migration create_route_stops_table
php artisan make:migration create_student_transport_table
php artisan make:migration create_hostels_table
php artisan make:migration create_hostel_rooms_table
php artisan make:migration create_hostel_allocations_table
php artisan make:migration create_online_classes_table
php artisan make:migration create_class_materials_table
php artisan make:migration create_tc_certificates_table

# Run all
php artisan migrate
```

## Seeder Execution Order
```bash
php artisan db:seed --class=PlanSeeder          # প্রথমে plans
php artisan db:seed --class=SuperAdminSeeder    # তারপর super admin
php artisan db:seed --class=DemoInstitutionSeeder    # demo institution + admin
php artisan db:seed --class=DemoDataSeeder      # demo students, classes, fees
```

---

## Additional Migrations (Revised — Extra Tables)
```bash
# Academic Year & Holiday
php artisan make:migration create_academic_years_table
php artisan make:migration create_holidays_table

# Student extras
php artisan make:migration create_student_documents_table
php artisan make:migration create_parent_student_table
php artisan make:migration add_extra_columns_to_users_table
  # fcm_token, must_change_password, notification_preferences, locale
  # failed_login_attempts, locked_until

# Batch capacity
php artisan make:migration add_max_capacity_to_batches_table

# Fee extras
php artisan make:migration create_fee_waivers_table
php artisan make:migration create_fee_structures_table
php artisan make:migration add_payment_extra_columns_to_fee_payments_table
  # payment_reference, payment_bank, payment_date, clearance_status

# Teacher assignment
php artisan make:migration create_teacher_subjects_table

# Exam extras
php artisan make:migration create_exam_seat_plans_table

# Subscription Invoice
php artisan make:migration create_subscription_invoices_table

# Academic Archive
php artisan make:migration create_archived_attendances_table

# Leave management
php artisan make:migration create_leave_types_table
php artisan make:migration create_leave_applications_table

# Soft deletes
php artisan make:migration add_soft_deletes_to_students_table
php artisan make:migration add_soft_deletes_to_teachers_table
php artisan make:migration add_soft_deletes_to_users_table
php artisan make:migration add_soft_deletes_to_notices_table
```

## Complete Migration Run Order (Final)
```bash
# Run all migrations in correct order:
php artisan migrate 2>&1 | grep -E "(Migrating|Migrated|Error)"

# To rollback:
php artisan migrate:rollback --step=5  # শেষ ৫টি undo

# Fresh start (wipe and re-seed):
php artisan migrate:fresh --seed
```

---

## Revision 4 — New Feature Migrations
```bash
# Fee Installment
php artisan make:migration create_fee_installment_plans_table
php artisan make:migration create_fee_installments_table

# Homework Submission
php artisan make:migration create_homework_submissions_table

# Online Exam / Quiz
php artisan make:migration create_online_exams_table
php artisan make:migration create_exam_questions_table
php artisan make:migration create_exam_attempts_table

# Student Extras
php artisan make:migration create_behavior_logs_table
php artisan make:migration create_student_health_records_table
php artisan make:migration create_certificates_table

# Institution Operations
php artisan make:migration create_visitor_logs_table
php artisan make:migration create_parent_meetings_table
php artisan make:migration create_alumni_table

# Auth
php artisan make:migration create_otp_tokens_table
php artisan make:migration add_2fa_whatsapp_to_users_table

# Institution Branch Support
php artisan make:migration add_branch_columns_to_institutions_table

# Excel Import Log
php artisan make:migration create_student_import_logs_table
```

---

## Revision 5 — New Feature Migrations
```bash
# GPS Tracking
php artisan make:migration create_vehicle_locations_table
php artisan make:migration add_gps_columns_to_vehicles_table

# Scholarship
php artisan make:migration create_scholarships_table
php artisan make:migration create_scholarship_applications_table

# Events & Competitions
php artisan make:migration create_institution_events_table
php artisan make:migration create_event_registrations_table
php artisan make:migration create_event_results_table

# Teacher Training / CPD
php artisan make:migration create_training_programs_table
php artisan make:migration create_teacher_trainings_table

# Exam Extras
php artisan make:migration add_admit_card_columns_to_exams_table

# Institution Branding / Per-Institution Theme
php artisan make:migration add_branding_columns_to_institutions_table
php artisan make:migration create_institution_theme_logs_table

# AI Usage Tracking
php artisan make:migration create_ai_usage_logs_table
```

---

## Revision 6 — Migrations

**Core table গুলো (Step 1–3) `schema.sql`-এর বর্তমান `CREATE TABLE` থেকেই লিখুন** — `institutions` (type, enabled_modules, terminology, settings, sms_balance, onboarding_*), `subscription_plans` (institution_type, max_batches, sort_order), `users` (nullable email, username, composite unique), `programs`, `batches`, `students`, `teachers`, `subjects.is_optional`, `exams.batch_id/exam_type`, `attendances.batch_id`, `fee_payments.enrollment_id/batch_id`, `fee_structures.batch_id` সবই মূল migration-এ থাকবে; এগুলোর জন্য আলাদা `add_*` migration লাগবে না। নিচের গুলো নতুন table:

```bash
# Enrollment (after students + batches + academic_years)
php artisan make:migration create_enrollments_table

# Coaching
php artisan make:migration create_batch_teachers_table
php artisan make:migration create_teacher_payouts_table
php artisan make:migration create_admission_leads_table

# SMS credits
php artisan make:migration create_sms_credit_transactions_table

# Theme presets (before add_theme_preset_columns)
php artisan make:migration create_theme_presets_table
php artisan make:migration add_theme_preset_columns_to_institutions_table
  # theme_preset_id, layout_key, theme_tokens

# Custom domains
php artisan make:migration create_institution_domains_table

# Teacher attendance (archived_attendances already listed above in "Academic Archive")
php artisan make:migration create_teacher_attendances_table

# Revision 6.2 — online fee payment (hybrid) and settlements
php artisan make:migration create_institution_payment_gateways_table
php artisan make:migration create_institution_payout_accounts_table
php artisan make:migration create_online_payments_table      # before fee_payments gets online_payment_id? no FK is declared, so order is free
php artisan make:migration create_settlements_table
  # R6.2 also adds columns INSIDE existing create migrations: institutions.sms_sender_*, sms_logs.sender_id/fallback_used/error,
  # notices.is_public, programs.is_public/public_description, admission_leads.guardian_name/email/current_class/message/interested_batch_id/ip_hash,
  # fee_payments.online_payment_id

# Revision 6.3 — exam subjects (schedule + per-exam marks); also adds results.component_marks/percentage/is_pass + unique_result inside the results migration
php artisan make:migration create_exam_subjects_table

# Revision 6.5 - report card summaries (was only in docs/modules/report-cards.md); also adds teachers allowances, online_classes/class_materials.description, results.teacher_remarks inside their create migrations
php artisan make:migration create_report_card_summaries_table

# Revision 7 - consent records (children's data); also adds users.failed_login_attempts/locked_until, soft-delete columns (students, teachers, users, notices, homeworks, class_materials), students.anonymized_at, admission_leads.consented_at inside their create migrations
php artisan make:migration create_consents_table
php artisan make:migration add_session_metadata_to_personal_access_tokens_table   # device VARCHAR(120) NULL, ip_hash CHAR(64) NULL

# Revision 10 - advanced academics, staff & payroll (FK order matters)
php artisan make:migration create_result_sheets_table
php artisan make:migration create_final_results_table
php artisan make:migration create_due_block_exemptions_table
php artisan make:migration create_period_attendances_table
php artisan make:migration create_routine_blocks_table
php artisan make:migration create_substitutions_table
php artisan make:migration create_student_leave_requests_table
php artisan make:migration create_staff_members_table
php artisan make:migration create_staff_attendances_table
php artisan make:migration create_salary_components_table
php artisan make:migration create_salary_revisions_table
php artisan make:migration create_salary_structures_table
php artisan make:migration create_salary_structure_lines_table
php artisan make:migration create_salary_pay_accounts_table
php artisan make:migration create_bonus_schemes_table
php artisan make:migration create_salary_advances_table
php artisan make:migration create_salary_adjustments_table
php artisan make:migration create_payroll_runs_table
php artisan make:migration create_payroll_items_table
php artisan make:migration create_provident_fund_entries_table
# column additions folded into their create migrations: leave_applications (user_id NULL, staff_id), exam_subjects (entry_deadline, locked_at, locked_by),
# teachers (leaving_date), teacher_payouts (payroll_item_id), expenses (payment_method, source, payroll_run_id),
# admission_leads (application_no + unique), certificates/tc_certificates (revoked_at), routine_blocks (shift), vouchers (unique source index),
# R14 performance indexes (27) are folded into the create_* migrations of their tables (docs/database/schema.sql, section R14),
# visitor_logs (department, photo), parent_meetings (parent_response_at), alumni (address, profile_photo), event_results (remarks), fee_payments (reverses_id)

# Revision 11 - finance, store, devices, platform ops, public plus, madrasa, insights, admission, migration, accounting, donations (FK order = schema.sql order)
php artisan make:migration create_cash_book_closings_table
php artisan make:migration create_fee_refunds_table
php artisan make:migration create_inventory_items_table
php artisan make:migration create_inventory_movements_table
php artisan make:migration create_attendance_devices_table
php artisan make:migration create_person_credentials_table
php artisan make:migration create_device_punches_table
php artisan make:migration create_support_tickets_table
php artisan make:migration create_support_ticket_messages_table
php artisan make:migration create_coupons_table
php artisan make:migration create_coupon_redemptions_table
php artisan make:migration create_platform_settings_table
php artisan make:migration create_impersonation_sessions_table
php artisan make:migration create_tenant_exports_table
php artisan make:migration create_gallery_albums_table
php artisan make:migration create_gallery_items_table
php artisan make:migration create_site_posts_table
php artisan make:migration create_lead_payments_table
php artisan make:migration create_hifz_records_table
php artisan make:migration create_syllabus_units_table
php artisan make:migration create_lesson_plans_table
php artisan make:migration create_syllabus_coverage_table
php artisan make:migration create_risk_flags_table
php artisan make:migration create_admission_cycles_table
php artisan make:migration create_admission_draws_table
php artisan make:migration create_import_jobs_table
php artisan make:migration create_import_rows_table
php artisan make:migration create_notice_receipts_table
php artisan make:migration create_sms_templates_table
php artisan make:migration create_sms_campaigns_table
php artisan make:migration create_ledger_accounts_table
php artisan make:migration create_vouchers_table
php artisan make:migration create_voucher_lines_table
php artisan make:migration create_budgets_table
php artisan make:migration create_budget_lines_table
php artisan make:migration create_donors_table
php artisan make:migration create_donation_funds_table
php artisan make:migration create_donation_campaigns_table
php artisan make:migration create_donations_table
# Question bank & quiz (D65/D66, docs/modules/question-bank.md - task QB.0; 3 grouped migrations 2026_10_11_00000{1,2,3}_qb_*)
2026_10_13_000001_qb_d74_metadata_defaults — add `und` and `mixed` defaults to `qb_questions`; existing rows are preserved (D74)
php artisan make:migration create_qb_class_levels_table
php artisan make:migration create_qb_subjects_table
php artisan make:migration create_qb_class_level_subject_table
php artisan make:migration create_qb_chapters_table
php artisan make:migration create_qb_chapter_class_level_table
php artisan make:migration create_qb_topics_table
php artisan make:migration create_qb_question_types_table
php artisan make:migration create_qb_questions_table
php artisan make:migration create_qb_question_options_table
php artisan make:migration create_qb_creative_parts_table
php artisan make:migration create_qb_question_stimuli_table
php artisan make:migration create_qb_question_items_table
php artisan make:migration create_qb_question_class_level_table
php artisan make:migration create_qb_question_occurrences_table
php artisan make:migration create_qb_question_revisions_table
php artisan make:migration create_qb_media_table
php artisan make:migration create_qb_media_links_table
php artisan make:migration create_qb_concepts_table
php artisan make:migration create_qb_resources_table
php artisan make:migration create_qb_prices_table
php artisan make:migration create_qb_price_rules_table
php artisan make:migration create_qb_unlocks_table
php artisan make:migration create_qb_student_orders_table
php artisan make:migration create_qb_student_unlocks_table
php artisan make:migration create_qb_writer_earnings_table
php artisan make:migration create_qb_writer_wallets_table
php artisan make:migration create_qb_writer_wallet_txns_table
php artisan make:migration create_qb_withdrawal_requests_table
php artisan make:migration create_qb_papers_table
php artisan make:migration create_qb_paper_sections_table
php artisan make:migration create_qb_paper_items_table
php artisan make:migration create_qb_quiz_packages_table
php artisan make:migration create_qb_quizzes_table
php artisan make:migration create_qb_quiz_questions_table
php artisan make:migration create_qb_student_package_access_table
php artisan make:migration create_qb_quiz_attempts_table
php artisan make:migration create_qb_import_map_table      # D69 (QB.11): qbank row → row here, for qb:import-from-qbank
# column additions folded into their create migrations: settlements, online_payments (student_id/parent_user_id now NULL), payments (method += coupon), subscription_invoices,
# teachers, institution_events, users, subjects, programs, batches, expenses, certificates, tc_certificates, notices, sms_logs, admission_leads

# Per-institution unique indexes
php artisan make:migration add_institution_unique_indexes
  # tc_certificates(institution_id, tc_number), certificates(institution_id, certificate_no)
```

Table count: **104** (`grep -c "CREATE TABLE" schema.sql`)। `add_max_capacity_to_batches_table` আর লাগবে না — `max_capacity` এখন `batches`-এর মূল definition-এ আছে।

## Laravel Framework Tables (NOT in schema.sql — generate with artisan)
`schema.sql` শুধু business table রাখে। নিচের table Laravel নিজে বানায়; Step 1.1-এ `migrate` চালানোর আগে এগুলো generate করুন:
```bash
php artisan install:api            # personal_access_tokens (Sanctum)
php artisan make:notifications-table   # notifications — in-app notification (NotificationService uses $user->notify())
php artisan make:queue-table && php artisan make:queue-failed-table   # jobs, job_batches, failed_jobs
```
Cache ও session Redis-এ, তাই table লাগে না। `notifications` table-এ `institution_id` নেই — notifiable (`users`) দিয়ে scoped; query সবসময় `auth()->user()->notifications()` দিয়ে, `DatabaseNotification::all()` কখনো নয়।

## D81 — R3.1 expense ledger

The new expenses create migration includes the existing schema ALTER fields and D81 nullable reversal/replacement references, unique_expenses_inst_id, unique_expenses_reversal, unique_expenses_replacement, fk_expenses_reversal and fk_expenses_replacement. Composite self-FKs enforce tenant-bound references. Nullable reference keys allow many ordinary entries (D81); no deleted_at. Approved tenant purge deletes ledger children before parents.

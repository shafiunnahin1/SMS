# R3.4 staff and leave contract — owner review draft

Status: PROPOSED, NOT APPROVED. Prepared 2026-10-15 after pushed R3.3 eefbc74 / completion c3594c3.

## Evidence requiring owner resolution

- Generated R3.4 depends on accepted R3.3: five tables, 18 routes, AttendanceSummaryTest and four Leave test classes. No Staff/Leave/TeacherAttendance implementation files found in api/app, api/tests or api/database/migrations.
- hr-payroll.md rule 6 permits applicant pending cancellation and admin approved cancellation before start, with reason. schema.sql leave_applications.status allows only pending/approved/rejected.
- Generated PATCH /hr/leaves/{id}/{action} is admin-only. Teacher self-service has GET/POST only. staff-payroll.md section 1 explicitly excludes a new staff role.
- Leave total_days excludes holidays and weekly holidays, but inspected HR specifications provide no weekly-day configuration/default. Tenant holidays and institutions.settings exist. Cross-year annual balance and summary attendance precedence require explicit policy.
- R3.4 LeavePayrollLinkTest requires unpaid lwp_days, while payroll execution and salary structures belong to later tasks (staff-payroll.md section 7.3).

## Proposed owner resolution

1. Keep R3.4 to staff profiles, daily teacher/staff attendance, leave types/applications and AttendanceSummary::forPayee(type,id,month). Preserve D33, modules, exact-one teacher user_id or staff_id, tenant validation and task order. No staff role, device punch, UI, salary/payroll execution or app/demo DB migration.
2. Add cancelled to leave status via authoritative schema/new migration; retain application rows. Pending can approve/reject/cancel; approved can cancel only before from_date, admin only, reason required. Identical applied transitions are idempotent, conflicts 409. Audit actors/reasons using existing infrastructure, no invented columns. Cancellation frees balance and removes leave from summaries, never rewrites frozen payroll.
3. Preserve 18 routes; broaden only PATCH /hr/leaves/{id}/{action} to admin,teacher. Service permits teacher only own pending cancellation, never approve/reject or another person. Admin retains other actions. No accountant cancellation or staff self-service. Align protected route-role inventory under the approved Change-Request; preserve existing assertions, add cases.
4. Count inclusive institution-local dates excluding tenant holidays and institutions.settings.hr.weekly_holidays (ISO weekdays 1..7, default []); no assumed national weekly day. Invalid configuration fails closed. All tenant holiday types are excluded for HR irrespective of student attendance policy. Require at least one working day; split dates by calendar year/month. Clamp summaries to joining/leaving dates. Approved leave takes precedence over attendance marks; each date counts once. Missing working marks count absent; late counts present with separate late_count. Summary returns working_days, present_days, absent_days, leave_days, lwp_days, late_count, no pay amounts.
5. Under shared institution lock, validate limits per person/type/year against approved days plus candidate at create and approval; pending does not reserve allowance but pending/approved ranges block overlap. Admin override requires reason and audit evidence. Snapshot accepted working dates/is_paid in approval audit evidence, use that snapshot for balance/summaries so later calendar/type changes do not reinterpret approvals; total_days stores accepted total. Audit IDs/dates/policy flags and reasons under existing privacy rules, no financial amounts/PII.
6. LeavePayrollLinkTest verifies approved unpaid lwp_days input, paid/rejected/cancelled exclusion, both payee types and month boundaries. It does not build future payroll tables/routes or claim payslip deduction. Payroll consumption stays in its later task. No future substitute-scheduling/device tables introduced.
7. Authorize only corresponding R3.4 schema/API/module/scope/generated role acceptance alignment, affected export/query/purge artifacts, backend and additive tests. Require LeaveOverlapTest, LeaveBalanceTest, LeavePayrollLinkTest, LeaveActorTest, AttendanceSummaryTest; tenant/role/module/privacy regressions, full API/frontend/theme, reference/freshness/parity/query/deep and staged guard. No weakening existing tests. Owner separately commits locked decision before protected edits; suggested next ID D85 is not reserved or written by agent.

## Review boundary

Approve all seven clauses or specify replacements, especially weekly default, attendance precedence, approval snapshot and teacher cancellation. This is not implementation/acceptance. Existing user-modified docs/BLOCKED.md stays untouched; blocker evidence is in this draft and agent logs.

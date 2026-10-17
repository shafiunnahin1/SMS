# D104 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D103 row)

Why: R3.7 must create `payroll_runs` and `payroll_items`, but `SalaryFoundationTest` (R3.5/D86, kept by D87) asserts these two tables do NOT exist. Changing a test assertion needs an owner decision (G5), exactly as D87 did for `salary_adjustments`. The other open R3.7 points below are the conservative defaults from docs/modules/staff-payroll.md.

| D104 | R3.7 payroll run contract | Owner approved (2026-10-17). (1) R3.7 creates `payroll_runs` and `payroll_items` exactly as docs/database/schema.sql; only SalaryFoundationTest's payroll_runs/payroll_items absence assertion becomes positive R3.7 schema coverage, every other assertion and golden fixture stays. (2) Calculation follows staff-payroll.md §7.3 through the pure PayrollCalculator verified against infra/spec-verify/payroll_ref.py; the 17 §16 fixtures are PayrollGoldenTest. (3) Lifecycle draft→reviewed→approved→paid with cancel/reject as §7.1; approved items/breakdowns are immutable (corrections are next-month adjustments or a supplementary run, D32); maker-checker per §7.2 with the audited if_sole_approver default; approvals admin-only. (4) Payment marks items paid, writes one `expenses` summary row per run and payment method (source=payroll) under the cashbook closed-day rules; regular-payroll advance recovery consumes approved skips and updates recovered/closure atomically and idempotently (D87); paid-month arrears and the separate bonus run are integrated here (D86). (5) Bank disbursement stays the generic CSV of §8 with `TODO(OD-bank-format)`; no bank-specific format, no tax/legal rate is assumed (tax mode stays `none` unless configured). (6) Routes are the 12 of the R3.7 plan for admin/accountant/teacher-own; department-staff access to them is a later D101-style step. No UI, live payment, new dependency or task reorder. |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad docs\LOCKED-DECISIONS.md
    # paste the row above on a new line right after the "| D103 |" row, save, close
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D104 R3.7 payroll run contract" -m "Change-Request: D104"
    git push origin claude/elegant-cori-gw2mw5

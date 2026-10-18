# R3.2 cashbook contract — owner review draft

Status: PROPOSED; no locked decision or implementation authorization yet.

## Evidence

- `docs/release/r3-scope.json` and generated `docs/AGENT-PLAN-R3.md` require expected closing 19,400.00 against `refs_r11.py`. That reference and `finance-advanced.md` instead assert 7,000.00 / -20.00 (opening 5,000 + 12,000 + 1,500 - 3,000 - 8,000 - 500). The accounting task's separate 19,400.00 fixture must remain intact.
- R3.2 requires closed-day writes to return 422; the module requires 409 `day_closed`.
- R3.2 requires append-only reopen under D32. The schema/module allow only one `(institution_id,date)` row and describe setting its status, preventing immutable close/reopen history.
- R3.2 sources are fee receipts and expenses. The broader module includes future store/donation/payroll/refund sources and lists both refund expenses and negative fee reversals, risking duplicate cash outflows.

## Proposed owner resolution

1. Keep the independent reference fixture at 7,000.00 / -20.00, correcting only R3.2's erroneous reference claim. Also test exact cash fee/expense aggregation with a separate R3.2 fixture; do not create future modules/tables to reproduce the broader example. Do not change the accounting 19,400.00 acceptance.
2. Use 409 `day_closed` for cash writes to a closed day; invalid inputs remain 422. Apply the lock atomically to fee collection and expense creation/correction/cancellation, including both original and replacement dates/methods when cash is affected. Serialize close/reopen and writes using the same tenant institution row lock.
3. Retain `cash_book_closings` as an append-only event/snapshot ledger: add positive unsigned `revision`, replace day uniqueness with `(institution_id,date,revision)` uniqueness. Each close/reopen/reclose inserts the next revision under the tenant lock; latest revision defines current status. Reopen copies the preceding close amounts/actor fields and adds its own admin/reason/timestamp; prior rows never update/delete. Reclose computes a fresh snapshot. Keep the existing five routes, roles and status values. Tenant purge retains its explicitly approved exception.
4. R3.2 counts positive cash fee receipts once and signed cash expense rows once (including expense reversals). Future payroll/refund expenses already represented in expenses must not be counted again as separate outflows; negative fee refund rows are excluded from cash totals when the same cash refund has its expense entry. Future source integrations belong to their later tasks. R3.2 must not implement refunds, payroll, store, donations or accounting.
5. Authorize only the corresponding cashbook schema/module/API/R3.2 acceptance clarification, generated plan/export artifacts and R3.2 implementation/tests. Preserve all other decisions and fixtures; require focused, full-suite and deep checks. No application/demo database migration is authorized by this draft.

Owner may approve this proposal or specify alternative resolutions. Under guardrails section 4, the approved resolution must first be recorded in a separate owner commit in `docs/LOCKED-DECISIONS.md` before protected edits proceed.

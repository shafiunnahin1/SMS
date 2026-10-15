# D86 — owner commit packet

Status: seven clauses approved in chat on 2026-10-15; separate owner registry commit pending. Full approved contract: owner/salary-structure-contract-decision.md, exact clauses a31faef.

Prepared registry row (not added by agent):

| D86 | R3.5 salary structure and settlement boundary contract | Owner approved (2026-10-15) all seven clauses of owner/salary-structure-contract-decision.md, approved text preserved in a31faef. Preserve six tables/24 routes, D32/D33 and task order; bonus apply fails closed 409 dependency_pending until R3.6 adjustment integration, bonus-run acceptance stays R3.7; automatic arrears affecting ended payroll months fail closed until integration, explicit arrears_policy=none waiver audited. Preserve effective-dated initial/future revisions, institution lock, immutable history/service-only preceding-period close, due scheduler, stale-source rejection/idempotent effects and decrement safeguards. Add salary_revisions.calculation_snapshot JSON NOT NULL with immutable reviewed source definitions/result/lines/policy and source fingerprints; never log sensitive amounts. Broaden only existing salary-history GET to admin/accountant/teacher (own teacher only); retain other salary/pay-account role restrictions/admin service approval/audited sole-active-admin exception; Super Admin and explicit impersonated tokens 403 sensitive_scope. Teacher caches leave fillable, service writes current structure only; derive staff salary without new cache columns. Encrypt account numbers, mask last four only, no full serialization/logging; atomic tenant/payee defaults and protected referenced/system components. Authorize corresponding R3.5 protected schema/API/module/template/generated/query/export/backend/additive tests and preserved R3.6/R3.7 acceptance pointers only; retain required focused/full/reference/parity/query/deep/guard checks and existing fixtures/tests. No UI, app/demo DB migration, real disbursement, later-table migrations or task reorder. Changes carry Change-Request: D86. |

Owner command from repository root:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\owner\approve-D86.ps1

Script is owner-run only. It rejects nonempty staging area, changed registry, missing D85 or existing D86, adds one row and commits only registry with Change-Request: D86. No push. No user blocker/untracked files touched. Agent must not execute the script or make the human approval commit. After owner commit: agent verifies/pushes and begins protected alignment.

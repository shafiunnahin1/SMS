# D85 — owner commit packet

Status: seven clauses approved in chat on 2026-10-15; this packet is not the locked decision. Agent must not edit the locked registry or make its human approval commit. Verify D85 remains unused before adding it.

Owner action: add the following row to the decision table in docs/LOCKED-DECISIONS.md, preserving all existing rows. The approved full contract is owner/staff-leave-contract-decision.md, clauses 1–7, exact proposed text in commit 3ab01cc.

| D85 | R3.4 staff attendance and leave contract | Owner approved (2026-10-15) all seven clauses of owner/staff-leave-contract-decision.md, approved text preserved in commit 3ab01cc: staff/teacher attendance and leave only; cancelled status and audited idempotent transitions; preserve 18 routes with teacher limited to own pending cancellation on existing transition route; tenant holidays plus settings.hr.weekly_holidays ISO 1..7 default [], strict calendar validation, yearly/monthly allocation and approved-leave precedence; institution-locked annual caps/overlap with reasoned admin override and approval date/is_paid audit snapshots; LeavePayrollLinkTest proves lwp_days input only, later payroll execution remains deferred; corresponding R3.4 schema/API/spec/generated/backend/additive tests authorized with all required verification. Preserve D33, modules, task order and existing tests. No new staff role, UI, device punch, app/demo DB migration or later payroll/task execution. Changes carry Change-Request: D85. |

Then run in PowerShell:

```powershell
cd "E:\Projects\School Management"
git add -- docs/LOCKED-DECISIONS.md
git commit -m "docs: approve D85 staff attendance and leave contract" -m "Change-Request: D85"
```

Stage only that registry file. Existing user docs/BLOCKED.md and untracked drafts/cache/text.txt must remain untouched. After the owner commit, the agent verifies the row/base/remote, pushes safely and begins only authorized R3.4 protected alignment before backend work.

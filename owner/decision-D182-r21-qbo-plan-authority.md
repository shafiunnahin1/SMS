# Draft Decision D182: align the approved QBO tasks with the generated R2.1 plan

> Owner review draft only. This does not change `docs/LOCKED-DECISIONS.md`, the guard, the generated plan, or application code. The owner must review and add the final row to the locked-decision registry in a separate human-authored commit before any protected plan change.

## 1. Issue

The approved QBO tasks are present in `infra/guard/agent_guard.py` and `docs/PROGRESS.md`, and their task-specific decisions exist (D179, D180 and D181), but the generated R2.1 plan still declares planning-only / implementation unauthorized and does not list QBO.1, QBO.2 or QBO.3. This leaves the task authority inconsistent.

## 2. Proposed contract

1. D83 remains in force for R2.1 placement and runtime activation. This decision does not switch `api/config/release.php` from R3, authorize the R2.1 runtime switch, or make any unlisted R2.1 task executable.
2. Under Change-Request D182, the agent may make the minimum protected planning/tooling changes needed to align `docs/release/r21-scope.json`, `infra/spec-verify/gen_r21_plan.py` and its tests, and the regenerated `docs/AGENT-PLAN-R2.1.md` / `docs/release/r21-plan.json` with the already owner-approved QBO tasks only:
   - QBO.1 under D179, after QBS.1.
   - QBO.2 under D180, after QBO.1.
   - QBO.3 under D181, after QBO.1.
3. QBO.2 and QBO.3 remain incomplete and cannot start until QBO.1 is accepted. Each task remains subject to its own Done When, dependency, task trailer and Change-Request. No task may be checked off by this planning alignment.
4. All R2.1 tasks outside this exact QBO list remain blocked unless separately named by an owner-approved decision. The runtime/module switch remains unauthorized and still requires its separately defined acceptance.
5. This decision authorizes only plan/scope/generator/guard alignment for the listed tasks. Feature implementation remains limited to D179, D180 and D181 respectively; no additional route, table, column, package, permission, or feature scope is authorized.
6. Planning commits carry `Change-Request: D182`. Feature commits carry their task's existing decision trailer: QBO.1/D179, QBO.2/D180 or QBO.3/D181.

## 3. Proposed locked-decision row

| D182 | Align the generated R2.1 plan with the approved QBO tasks only | Owner approved (2026-10-28). (1) D83 still governs R2.1 placement; no R2.1 runtime switch or release change is authorized. (2) Under Change-Request D182, the agent may minimally align `docs/release/r21-scope.json`, `infra/spec-verify/gen_r21_plan.py` and its tests, and the generated R2.1 plan artifacts so only QBO.1/D179 after QBS.1, QBO.2/D180 after QBO.1, and QBO.3/D181 after QBO.1 are represented as approved executable tasks. (3) QBO.2 and QBO.3 cannot start until QBO.1 is accepted; this decision does not check off any task. (4) Every other R2.1 task remains blocked unless separately authorized; the runtime switch remains unauthorized. (5) No feature scope or schema, route, package or permission beyond D179, D180 and D181 is added. Planning commits carry `Change-Request: D182`; implementation commits carry the applicable task and D179/D180/D181 trailers. |
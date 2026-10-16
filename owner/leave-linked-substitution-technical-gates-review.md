# Leave-linked substitution: technical gates and coordinated review

Date: 2026-10-16. Status: NON-EXECUTABLE REVIEW PROPOSAL. Companion evidence: `owner/leave-linked-substitution-planning-review.md` and `owner/leave-linked-substitution-policy-draft.md`. D95 is registered, but this packet does not extend its authorization, assign a decision number, alter a task, or claim implementation readiness.

## Live repository checkpoint

- Branch: `claude/elegant-cori-gw2mw5`; HEAD: `f4db844d6df93f7abeef8570fc6ec09632825b9d`; upstream status showed no ahead/behind marker. The latest dirty state has no staged diff.
- Existing unstaged owner/shared files: `AGENT-HANDOFF.md`, `docs/BLOCKED.md`, `docs/IDEAS.md`, `docs/PROGRESS.md`. Existing untracked caches, owner decision drafts, and `text.txt` are preserved. None are edited by this review.
- The latest D95 handoff says the owner-finalized row was committed/pushed as `31a1512`, following planning evidence `33ba79f`; the live registry contains D95. The active R3.6b work remains incomplete and current R3.6b/R3.7 order must remain unchanged.
- Only this new review artifact is added. No shared log, index, canonical source, plan, schema, runtime, test or generated file is edited; nothing is staged or committed.

## Hypothesis and disconfirming check

Hypothesis: D95 resolves policy and broad Phase 7 placement, but the live sources still describe the old R2/admin flow and the current table cannot represent the accepted optional, reviewed and versioned lifecycle. Therefore no storage/API/plan/runtime task is safe until the remaining contracts are owner-reviewed and separately authorized.

The hypothesis would be disconfirmed if current source already had the accepted Phase 7 task/dependencies and a durable unassigned/versioned leave-linked offer representation. The targeted live reads instead found:

| Live source | Evidence | Planning consequence |
|---|---|---|
| `docs/BUILD-SEQUENCE.md`, Step 6.6 | Still tagged R2 and bundles `period_attendances`, `RoutineConflictService`, `routine_blocks`, `substitutions`, student leave and unrelated advanced-academic work. | D95 permits deferring only leave-linked substitution; do not move the whole step or silently relocate conflict/block foundations. |
| `docs/BUILD-SEQUENCE.md`, Phase 7 | Routine Builder is #2; HR/leave is #6; no substitution task exists. | A separate non-executable dependency note may follow both only within reviewed source scope. Preserve existing numbering/order; do not add an executable task ID now. |
| `docs/ROADMAP.md`, row 4 | Routine conflict/blocks/substitution are grouped in R2 with routines and leave dependencies. | The source split and dependency description still need the D95-bounded canonical refinement and owner review. |
| `docs/modules/academics-advanced.md`, sections 3/4.3 | Admin selects a substitute after leave approval; teacher acceptance confirms it; the dated-period and attendance wording predates nomination/reviewer-offer separation. | Current text is not a complete contract for the accepted workflow. |
| `docs/database/schema.sql`, `substitutions` | `substitute_teacher_id` is NOT NULL; status is requested/confirmed/cancelled; unique `(routine_id,date)`; no leave relation or versioned event history. | Existing DDL cannot represent an unassigned slot or preserve nomination, reviewer offer, acceptance and replacement history as distinct durable events. No DDL is authorized here. |
| `docs/release/full-scope.json` and `docs/AGENT-PLAN-FULL-DRAFT.md` | `substitution` remains M3 and depends only on `routine`; draft `F.M3.14` has admin-only routes and generic checklist. | M3 is a milestone distinct from Phase 7 execution order. Do not change it or promote the draft; dependency/milestone/source alignment needs explicit review. |
| `docs/modules/hr-payroll.md` D85 and `api/app/Services/Hr/LeaveService.php` | D85 bounds pending/approved cancellation and snapshots. `create` and `transition` lock the tenant institution row inside a transaction. | Reuse D85-compatible behavior and require every relevant writer to join the agreed serialization protocol; this review does not assume routine writers already do so. |
| Current `api` routes/runtime/tests | `api/routes/api.php` has no `routines`, `routine-blocks`, `period-attendance` or `teacher/periods` route. It does have D85 `/hr/leaves` routes, teacher leave routes, and daily `/attendance` routes. No runtime `Routine*`, `RoutineBlock*`, `PeriodAttendance*` or `Substitution*` class/file, and no matching routine/period/substitution feature test, was found. | Routine-builder, dated period-attendance and substitution runtime dependencies are not accepted/present at this checkpoint. Draft route lists and schema names are not live access contracts. |
| Existing attendance/leave writers | `LeaveService::create/transition` and `StaffAttendanceService::save` use transactions and lock the institution row. `AttendanceService::saveBulk` uses a transaction; no institution-row lock was found in that current daily-attendance service. | Leave's current lock is a reusable precedent, not proof that future routine/cover/period-attendance writers share it. Complete future writer inventory and lock adoption remain an acceptance gate. |

The D95 row is limited to canonical policy/dependency clarification in six named documents. It explicitly excludes schema, API/authorization implementation, executable/generated plans and machine release/milestone changes. D95 does not resolve the additional contract choices below.

## Recommended contract decisions for owner review

These are concrete proposals, not locked decisions. P1-P15 in the companion policy draft are owner-finalized behavior and should be carried forward; this packet does not reopen them.

### 1. Storage and history

Recommended candidate: retain one current occurrence/coverage slot keyed to the source routine occurrence and institution, with an explicit leave link where applicable and an unassigned state; retain each nomination, review/offer, acceptance, decline, replacement and cancellation as immutable versioned history. Only the current accepted version can authorize dated attendance. Preserve existing non-leave substitution reasons and rows; do not auto-convert historical rows.

Before schema work, the owner must choose the exact relationship to the existing `substitutions` row, whether history is a separate append-only record or an already-approved audit primitive, and the exact tenant-bound keys/FKs/uniqueness, delete/purge/export behavior and version identity. Resolve whether `(routine_id,date)` is tenant-safe/current-slot uniqueness and how current assignment uniqueness coexists with retained versions. Do not simply make `substitute_teacher_id` nullable or add guessed columns/tables. Any selected DDL needs a separate owner-authored Change-Request explicitly naming `docs/database/schema.sql`, append-only migration scope, export/purge references and required schema checks.

### 2. Logical lifecycle to durable transitions

P1-P15 establish the policy: applicant nomination on own pending leave is advisory and non-reserving; a reviewer may retain/replace/clear it during review; approval may leave gaps; an approved leave reviewer may fill future gaps; a current versioned offer is accepted or declined only by its target; only successful acceptance after fresh locked checks confirms cover. No automatic expiry scheduler is required; offers stop being actionable at period start or invalidation. A decline leaves a gap; replacing confirmed future cover revokes the old future authority and requires fresh acceptance. At/after start, acceptance/replacement/source-destroying correction is denied in this first scope. No history is deleted.

Still owner-review the exact durable event names/status mapping, version increment rules, replay/idempotency key, stale-version result, retry behavior and how an accepted cover remains distinguishable from an offer after leave/source invalidation. Keep these as logical transitions until the storage contract is approved; do not create an enum from the prose.

### 3. Leave/date and routine reconciliation

Preserve D85 snapshots and cancellation boundaries. For a date change, use D85-compatible cancel/reapply; do not add in-place amendment for pending, approved-current or past leave. Rejection/cancellation and a new application must not retarget old offers. A substitute's subsequently approved leave invalidates that teacher's affected future covers without cancelling the original applicant's leave. Routine teacher/time/batch change or deletion must reconcile future offers/covers through the same protocol; after period start, deny destructive source changes in this first scope. Preserve completed attendance/history.

Before implementation, inventory every routine/block/leave/source mutation and specify the reconciliation action and audit reason for each. The first policy scope does not establish which current routine writers exist or prove they all participate.

### 4. Actors, capabilities and module gates

Proposed action matrix for owner confirmation, with exact capability strings intentionally unset:

| Actor | Allowed action | Required identity and boundary |
|---|---|---|
| Applicant | Nominate, clear or replace a nomination | Own pending leave; real active Teacher; before period start; exact selected department/context under D88/D91 as applicable. |
| Reviewer | Approve leave and retain/replace/clear nomination; fill a future approved gap; replace/clear future cover with reason | Exact separately reviewed capability; active tenant/context; no self-approval or self-review under P6; a reviewer is not automatically an eligible Teacher. |
| Offered substitute | Accept or decline own current offer | Same-tenant, fresh, unambiguous active Teacher identity; target and expected version match; before start; no role spoofing or impersonation bypass. |
| Attendance writer | Record the dated period for the current confirmed cover | Recheck current cover, source occurrence, date and teacher inside the attendance write boundary; nomination/review alone grants nothing. |

No new global role, designation-derived access or sole-admin exception is proposed. The owner must approve exact D88 duty keys, reviewer separation/maker-checker behavior, supported institution types and `module:`/`feature:` gates before route exposure. Preserve the existing module policy and all unrelated role/resource gates.

### 5. Shared concurrency protocol

Recommended initial protocol: one transaction per state-changing operation; acquire the current institution row lock first (the existing D85 leave pattern), then lock/re-read affected rows in one documented deterministic order, validate current versions and full-interval eligibility, append audit/history and persist the transition atomically. A bounded deadlock retry must leave no partial state. The routine/date unique key is not a teacher-time mutex: two different source routine IDs can overlap.

The required writer inventory is: leave create/approve/reject/cancel; cover nominate/review/offer/accept/decline/clear/replace/cancel; routine create/update/delete; routine-block create/update/delete; any schedule/holiday reconciliation writer; and period-attendance authorization/write where cover may be revoked concurrently. Identify controller, service, job and administrative paths for each from live source before choosing the shared helper. A single unverified writer blocks concurrency acceptance. Prove two real DB connections racing different routine IDs for the same teacher/time, plus acceptance versus leave/routine/block invalidation. No new lock table/distributed lock is authorized by this proposal.

### 6. API, error, idempotency and privacy

Do not use the route list in `F.M3.14` as an approved contract. First map existing routes/controllers and the D88/D91 route-action authorization model; then owner-review an action matrix for own nominations, reviewer offers/gap fill, target accept/decline, and date-aware availability. Each mutating request should bind the leave/source occurrence/date and expected version; the server derives tenant, original teacher and actor identity. No caller-supplied teacher ID is authorization.

Align status codes and envelopes with `docs/API-ERRORS.md`; exact route names, payload fields, capability keys, 403/404 disclosure order, 409 stale/conflict semantics, 422 validation and idempotency/replay behavior remain to be approved. A repeated identical transition may return its original result only if the approved idempotency identity is stable; an old acceptance must never confirm a replacement.

Persist transition audit and notification intent atomically only after an approved delivery/outbox design exists. Deliver in-app after commit; SMS only under existing consent/provider policy. Minimal period/class information only; never expose leave reason, medical detail, salary, broad directory/contact data or secrets. Delivery retry must not replay a state change. No delivery test may contact a real provider.

### 7. Release and plan-source alignment

Recommendation: keep `substitution`'s current M3 milestone label unchanged until the owner explicitly decides otherwise; M3 classification and Phase 7 task order are different dimensions. Under D95, the only proposed placement is a distinct **non-executable** Phase 7 dependency note after routine #2 and HR/leave #6 plus accepted period-attendance integration. Preserve Step 6.6's unrelated advanced-academic scope and do not move the current R3.6b/R3.7 work.

The full-scope source currently has only `routine` as a substitution dependency. A later owner-reviewed source-plan change should add the accepted teacher-leave and period-attendance prerequisites using the canonical module keys verified at that checkpoint, and decide whether the milestone source remains M3. Do not edit `docs/release/full-scope.json`, generators, `docs/AGENT-PLAN-FULL-DRAFT.md`, release config or any generated plan under D95. Generated output is not executable. Assign no task ID until the authorized source/generator path and dependency acceptance are agreed.

### 8. Acceptance criteria to attach to the future task

Keep every current test/assertion. Proposed additive acceptance must prove:

- All four institution types' approved/unavailable module paths, tenant/context isolation, exact capability, own applicant/target/reviewer boundaries, foreign IDs and support impersonation behavior.
- Leave approval with unassigned slots; nomination/review does not reserve or authorize; target-only acceptance confirms exactly the current version; decline, stale retry, replacement, late gap fill and idempotent replay preserve history.
- Full containment and partial overlap conflict; adjacent `end == start` is allowed; recurring teaching, confirmed cover from another source, approved leave, blocks and class/room constraints are date-aware. The same source occurrence is excluded only from self-conflict.
- Real two-connection races across different routine IDs, and races against leave approval/cancel, routine/block change and attendance write; at most one overlapping confirmation, with rollback/no partial audit or leave effect.
- D85 cancel/reapply behavior, source/leave invalidation, before-period cutoff, audit actor/reason/version and post-commit notification retry; past attendance and completed history unchanged.
- Confirmed cover appears only for its source occurrence/date; weekly routine rows and all payroll/salary/expense/payment rows remain unchanged.
- Existing API error envelope, exact authorization and module/feature gates, schema/export/purge consistency, focused/full tests, generated freshness and repository-required checks once the task is authorized.

These are proposed acceptance criteria only. No application test, full-suite, deep verifier, generator, database or browser check was run for this review.

## Owner-accepted technical direction and formal CR draft

On 2026-10-16 the owner accepted the recommendation set in chat: Storage B (separate leave-linked current slot plus append-only lifecycle history; preserve legacy non-leave substitutions), Actors C (separate capabilities and no self-review/implicit sole-admin bypass), API A with Retry A (leave-rooted actions, expected version and idempotent replay), Concurrency A (institution-row lock shared by all relevant writers), and Release B (retain the M3 classification while Phase 7 execution remains dependency-gated and source-plan dependency reconciliation is separately reviewed).

This records accepted technical direction only. It is not a formal Change-Request, a decision-registry row, an exact physical schema/API/key contract, task acceptance, or runtime authorization. No decision number is assigned or reserved here.

The owner subsequently authorized proceeding with this exact technical Change-Request scope and instructed autonomous continuation. The live registry is checked at the decision checkpoint; its next unused identifier will be written only in the separate registry-only decision commit. Until that commit exists, this text remains a draft and protected technical changes remain unauthorized.

### Unnumbered owner-authored Change-Request draft

The owner may edit this text and, after checking the live registry, author the exact row with an unused identifier in a separate decision commit. Do not copy this draft as if it were already recorded or approved.

**Title:** Leave-linked substitution technical contracts and source-plan alignment (design only)

**Proposed scope:** Authorize canonical design refinement for the owner-accepted choices above: define a leave-linked current occurrence slot and append-only transition history while preserving legacy non-leave substitutions; specify applicant/reviewer/target actions and exact reviewed capability mappings; define leave-rooted API actions, expected-version/idempotency, validation/error/privacy and notification contracts; inventory every affected leave, cover, routine, block and period-attendance writer and specify the shared institution-row lock/retry protocol; retain the substitution module's current M3 classification and reconcile only its dependencies with accepted routine, teacher-leave and period-attendance prerequisites. Keep the Phase 7 entry non-executable and preserve current R3.6b/R3.7 order.

**Protected sources this draft proposes to authorize:** `docs/database/schema.sql`, `docs/API.md`, `docs/AUTHORIZATION.md`, `docs/modules/academics-advanced.md`, `docs/modules/routine.md`, `docs/modules/hr-payroll.md`, `docs/TESTING.md`, `docs/release/full-scope.json`, `docs/BUILD-SEQUENCE.md`, and `docs/ROADMAP.md`. Regenerate any derived release-plan documents only from the approved source after freshness checks; do not hand-edit generated output. If the owner wants narrower approval, split physical schema, API/authorization, and machine release-source work into separate decisions.

**Explicit exclusions:** schema migration/backfill/export/purge implementation; runtime route/service/controller/middleware/attendance changes; `api/config/release.php` or module activation; UI; new dependency; deployment/delivery; an executable task ID/order; changing the M3 milestone; reordering or completing R3.6b/R3.7; marking any task executable/complete; changing existing tests except adding approved future acceptance coverage. The contract and dependency acceptance must be reviewed before a later implementation authorization.

**Required review evidence before implementation:** exact tenant-safe schema/history/version/FK/uniqueness and purge/export behavior; exact endpoint/action/capability/error/idempotency matrix; four-type module gates; complete writer inventory and proof every relevant writer shares the lock; two-connection overlap and invalidation race acceptance; accepted routine, teacher-leave and period-attendance dependencies; generated-plan freshness; all existing tests preserved. This draft authorizes no implementation or task completion by itself.

## Owner and active-agent coordination path

1. The owner has accepted the recommendation set above. P1-P15 and D95 remain the only recorded substitution policy/placement decision; this file and its CR draft are not a new decision.
2. The active R3.6b agent confirms a non-overlapping review window and preserves the current R3.6b/R3.7 work. This agent has no direct messaging/coordination tool in this session; this artifact is left separate and unstaged for handoff. Do not infer an exclusive window from the empty index.
3. For any technical protected change, the owner authors and commits a new, separately numbered Change-Request with exact files and scope after checking the live registry. Do not assign or reserve a D-number here. Split approvals if needed: logical/API/capability contract; physical schema/migration/export/purge; and executable release/source-plan/generator alignment. D95 alone does not grant those scopes.
4. After the required CR exists and the active agent coordinates the index, refine only approved canonical sources. Regenerate only after source/dependency decisions; run focused source proofs, freshness checks, spec verification and guard at the authorized checkpoint. Report planning checks as planning checks, never runtime/full-suite acceptance.
5. Implementation remains blocked until accepted routine builder, accepted teacher leave and required period-attendance authorization integration are evidenced, plus the storage/API/writer-lock/module gates and task acceptance criteria. No checkbox, executable task, runtime route, module activation, migration, rollout or completion claim follows from this review.

## Evidence commands and limits

Read-only evidence checked against live HEAD `f4db844d6df93f7abeef8570fc6ec09632825b9d`:

- `git status --short --branch` showed the current branch, no staged diff, and pre-existing shared dirty/untracked files listed above.
- `git rev-parse HEAD` returned the recorded HEAD.
- `Select-String` on `docs/BUILD-SEQUENCE.md` confirmed Step 6.6 R2 and Phase 7 #2/#6 with no substitution row.
- `Select-String` on `docs/ROADMAP.md` returned row 4 with substitution in R2 and a separate R3 payroll reference to the substitutions table.
- Targeted reads of `docs/modules/academics-advanced.md`, `docs/modules/routine.md`, `docs/modules/hr-payroll.md`, `docs/database/schema.sql`, `docs/release/full-scope.json`, and `docs/AGENT-PLAN-FULL-DRAFT.md` confirmed the evidence summarized above.
- `LeaveService.php` shows institution-row locks in create/transition; a targeted runtime search found no substitution handler.
- A second route/class/test inventory found no current routine, routine-block, period-attendance or substitution API/runtime/test implementation. It found the existing D85 leave and daily-attendance endpoints and the transaction/lock distinction summarized above.

No status/log/shared file was changed, no stage/commit/push/fetch/reset/rebase was performed, and no task was marked executable/complete. This review is untracked and does not establish any repository gate or feature acceptance.
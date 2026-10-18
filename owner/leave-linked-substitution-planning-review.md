# Leave-linked substitution: owner planning review

Date: 2026-10-16. Status: NON-EXECUTABLE PLANNING PROPOSAL. Workflow recommendation accepted by owner; no formal Change-Request is inferred. No task is executable or complete. No decision number is reserved by this packet.

## Shared-worktree boundary and continuity

Observed branch: claude/elegant-cori-gw2mw5; HEAD d9676d9. Index was empty. Existing unstaged files: AGENT-HANDOFF.md, docs/PROGRESS.md, docs/BLOCKED.md, docs/IDEAS.md; pre-existing untracked owner drafts, caches and text.txt were present. User explicitly reports another agent working in this worktree. Its live state supersedes this snapshot. Current release config is R3; latest handoff says R3.6b incomplete, with teacher-index canonical work next. This proposal does not reorder or modify that work.

Only this new owner review file is written. Shared logs, index, other agent changes, protected specs/plans/schema, runtime and tests remain outside this editing scope. No stage, commit, push, database access, runtime test runner or generator is required for this review. Coordinate with the active agent before merging future edits to common files. This file serves as isolated planning evidence rather than appending to the already dirty shared handoff.

## Authority and evidence

AGENTS.md and docs/LOCKED-DECISIONS.md govern precedence; CLAUDE.md imports AGENTS and docs/ops/agent-guardrails.md. Guardrails section4 requires a separate owner-authored committed Change-Request before protected refinement. Workflow acceptance alone does not meet that requirement.

| Source | Current evidence | Consequence |
|---|---|---|
| docs/modules/academics-advanced.md sections4.1/4.3 | Approved leave triggers Admin assignment; substitute acceptance produces confirmed. Generic conflict policy allows configured audited force override. | Applicant nomination and approval review are new stages; hard conflict-free cover needs an explicit override policy. |
| Same module section3 | Substitution lets teacher see today's period and take period attendance. | Future authorization must require current confirmed date-specific cover, not mere nomination/request. |
| docs/modules/routine.md conflict example | Uses whereBetween on endpoints; misses full containment and can count adjoining periods as conflicts. | Align with the strict overlap predicate already specified in academics-advanced section4.1; do not copy the example blindly. |
| docs/BUILD-SEQUENCE.md Step6.6 | Release R2 bundles period attendance, routine conflicts/blocks and substitutions. | The conflict extends beyond the roadmap; split/defer substitution explicitly, retaining unrelated advanced-academic work. |
| docs/BUILD-SEQUENCE.md Phase7 | #2 routine builder; #6 HR/leave. | Proposed separate leave-linked substitution task follows both accepted dependencies. No global renumbering is proposed. |
| docs/ROADMAP.md row4 | Substitution/conflict/blocks listed as R2, dependent on routines and leave. | Resolve release placement formally rather than treating a specification tick as implementation readiness. |
| docs/release/full-scope.json | routine M2; substitution M3; substitution dependency lists routine only. | M-number is a milestone, not the R-number. Review both milestone and leave dependency; do not mechanically rename M3. |
| docs/AGENT-PLAN-FULL-DRAFT.md | Existing routine/substitution planning is draft and non-executable. | Regenerate only after approved source/dependency refinement; no invented executable task ID. |
| docs/modules/hr-payroll.md D85 and owner/staff-leave-contract-decision.md | R3.4 backend accepted; approved cancellation requires Admin/reason and before start; no approved-date amendment contract. | Preserve D85 until an explicit approved amendment; leave acceptance does not mean routine dependency is ready. |
| docs/database/schema.sql substitutions | Non-null substitute_teacher_id; requested/confirmed/cancelled; unique routine/date; no leave-application link or review/acceptance provenance. | Existing schema cannot fully represent unassigned nominations and leave-linked lifecycle without reviewed storage refinement. |
| docs/IDEAS.md routine/leave row | Non-executable proposal; earlier flow lacks the now accepted approval review/acceptance details. | Keep original owner change untouched; add a superseding planning note only after coordination. |

## Accepted workflow to preserve in a formal proposal

1. On a teacher leave application, enumerate each affected routine period on each actual institution-local date. Applicant may nominate an available substitute for each occurrence. Empty availability leaves that slot unassigned; nomination is optional and does not authorize attendance or reserve a confirmed duty.
2. Availability is for the full date/time interval, including recurring teaching, confirmed dated cover, approved leave and applicable block/teacher/class/room constraints. Recheck server-side on nomination/assignment, approval review and acceptance. A displayed list is never authorization.
3. HR/principal with a formally approved exact capability may confirm or replace the nomination during leave approval, and assign unfilled slots later. Leave approval and assignment review do not mean the substitute has accepted. Do not introduce a new global HR role or infer permission from a label.
4. The nominated substitute accepts their current reviewed assignment; only then is it confirmed. Reject stale/replaced assignments. Decline/withdrawal/retry details still need the policy below.
5. Confirmed cover binds source routine period plus actual date and accepted leave source. It overlays only that occurrence in the substitute's routine/period-attendance authority. Do not update the weekly routine. Existing attendance history is retained.
6. Leave rejection/cancellation or date change cancels or reconciles affected cover atomically and audibly; notify affected actors under consent/delivery policy. Reassignment requires fresh eligibility and acceptance. No hard deletion of assignment history.
7. Concurrent approval/assignment/acceptance/routine or leave changes cannot double-book a teacher. No automatic payroll change, payout, salary adjustment or paid-month rewrite.

## Exact proposed protected edits (NOT APPLIED)

A. docs/BUILD-SEQUENCE.md Step6.6: remove substitution implementation/acceptance from the R2 step's executable scope and state: "Leave-linked substitution is deferred to a separate Phase7 task after accepted routine builder and teacher-leave dependencies. Other advanced-academic features retain their approved scope; period-attendance substitution integration waits for that task." Owner must explicitly approve any split of routine-conflict/blocks foundations rather than moving the whole step by implication.

B. docs/BUILD-SEQUENCE.md Phase7, after #6: add a separate dependency-gated task without renumbering existing modules: "Leave-linked substitution (substitution): depends on accepted routine builder (#2), teacher leave (#6/R3.4) and the authorized period-attendance integration. Implements optional applicant nomination, approval review, substitute acceptance, date-specific overlays, cancellation/reassignment, conflict rechecks, race protection, audit/notification; no automatic payroll change. Task ID, release placement and scope become executable only after owner-approved source/generated-plan alignment." A new task at this location is proposed, not scheduled into current R3.6b/R3.7.

C. docs/ROADMAP.md row4: replace the blanket R2 release cell with "routine-conflict/blocks foundation: owner-resolved placement; leave-linked substitution: dependency-gated Phase7 task after routine + teacher leave"; expand dependency cell to accepted routine, teacher leave and period-attendance integration. Preserve specified-versus-implemented distinction and unrelated rows.

D. docs/modules/academics-advanced.md section4.3: replace the approval-only flow bullet with accepted workflow clauses1/3/4 above; add clauses5/6/7 as invariants. Replace generic requested/confirmed interpretation with explicit nomination, review and acceptance semantics after lifecycle/storage approval. Amend section3 so only current confirmed cover authorizes the dated period. Add the test matrix below to sections8/9, with every checkbox left unchecked. Do not silently change generic routine override behavior.

E. docs/modules/routine.md Conflict Detection Logic: replace endpoint-inclusive whereBetween overlap example with start < other.end AND end > other.start, excluding the updated row and scoping tenant/day correctly. Specify dated confirmed-cover overlay in existing teacher/today views; leave weekly CRUD unchanged. Date-aware availability must include approved leave and existing confirmed covers. Final API date/version/error contract remains pending; do not add guessed endpoints.

F. docs/modules/hr-payroll.md: preserve D85; add the accepted nomination/review/acceptance linkage, optional unassigned slots and cancellation reconciliation. Explicitly state that unfilled cover does not itself reject leave, unless owner chooses a different rule. Date amendment must use the owner-selected policy below and preserve approved snapshots/audit.

G. docs/API.md, docs/AUTHORIZATION.md, docs/TESTING.md and the department route contract: refine only after exact endpoints/actions, capabilities, fields, privacy/error/idempotency and feature gates are owner approved. Reuse existing substitution/availability endpoints where possible; their current weekly-day-only example is insufficient for date-aware eligibility. Applicant acts only on own leave; substitute acts only on own current offer; reviewer acts only within authorized tenant/context. Teacher IDs alone are not grants.

H. docs/database/schema.sql and future append-only migration: no DDL proposed as finalized. Owner must choose how to represent optional slots, leave linkage, nomination/reviewer/acceptance provenance, replacement/version and immutable history. Preserve tenant-safe FKs and routine/date uniqueness intent; review whether that uniqueness models current assignment versus history. Do not fabricate a new table or make substitute nullable without this decision.

I. Release source and generators: identify the actual source owner before edits. Review docs/release/full-scope.json substitution dependency on accepted leave/attendance alongside routine and reconcile its milestone placement. Update only approved source definitions and regenerate affected draft/plan artifacts, then verify freshness. No direct generated-file edit, release config/module enablement or current R3 task insertion. Keep the D87 unavailable-substitution dependency_pending behavior until the approved integration actually exists.

J. docs/IDEAS.md and shared handoff/progress: leave current other-agent changes untouched. After coordination, append a superseding proposal-status pointer to this review and the eventual formal owner decision, retaining history. Do not mark an executable/complete task or overwrite the current execution pointer.

## Unresolved gates and recommended choices for owner review

| Gate | Recommendation, not a locked decision |
|---|---|
| Formal authority and placement | Owner-authored separate Change-Request must explicitly approve the scoped canonical changes and Phase7 placement; no decision ID is assigned here. Keep current R3.6b order untouched. |
| Required coverage versus leave approval | Permit leave approval with unassigned slots, displaying gaps for later assignment; cover availability should not implicitly veto leave. |
| Availability reservations | Nomination is advisory, not a guaranteed reservation. Recheck at every transition; decide whether reviewed requested assignments hold a temporary reservation or compete on acceptance. |
| Reviewer capability and self-cover | Define exact HR/principal duty keys and maker-checker rules. A reviewer can cover only if also a real eligible Teacher; administrative status alone never proves teaching availability. Decide self-approval/acceptance restrictions. |
| Conflict override | Confirmed cover should reject conflicts even when generic routine force override is enabled. Any exception conflicts with the accepted conflict-free workflow and needs explicit owner resolution. |
| Dates and leave amendments | Prefer existing cancel-and-reapply where D85 permits it. Changing an approved/current/past leave needs a separate amendment policy, reason, snapshots and reconciliation; no silent date mutation. |
| Routine edits and holidays | Define which dated occurrences exist, holiday/week-off behavior, and routine version changes. Reconcile future offers if source time/teacher changes; retain completed occurrence/attendance history. |
| Acceptance/decline lifecycle | Decide offer expiry, substitute decline/withdrawal, reviewer replacement after confirmation, cancellation cutoff and idempotency/conflict errors. No state enum is finalized here. |
| Storage and history | Choose nullable slot versus separately modeled nomination/assignment before DDL; require leave/source/date/version linkage and append-only audit. Preserve cancelled/replaced history without breaking current-assignment uniqueness. |
| Atomicity and race protection | Specify a shared serialization protocol observed by all relevant routine/leave/cover writers, deterministic lock order and retry behavior. Routine/date UNIQUE alone cannot prevent overlapping covers for the same teacher across two routines. Prove two-connection races; do not invent exact lock storage here. |
| Notifications and privacy | In-app required; SMS only consent/provider policy. Post-commit/idempotent delivery, no stale offer acceptance, cancellation/reassignment notification, no leave reason/medical/PII leakage; delivery failure must not double-apply transitions. |
| Acceptance and deployment | Exact API/schema/capability tests, dependency acceptance and required repository gates precede execution/rollout; feature/module defaults and supported institution types must be reviewed. No automatic payroll changes. |

## Required future tests (acceptance criteria proposal)

- Tenant/context isolation, exact duty, own applicant/substitute and authorized reviewer; reject foreign IDs, spoofed role, stale account/profile and impersonation where required.
- Nomination per date/period, no candidate leaves unassigned, approval retains/replaces nomination, late gap fill, substitute acceptance only on current offer, idempotent retry and stale replacement conflict.
- Full-containment/partial overlap and adjacent end=start; own weekly teaching, confirmed cover across different source routines, approved leave, fixed blocks and class/room constraints; date-specific differences and source edits/holidays.
- Two real concurrent connections racing acceptance/assignment for overlapping different routine IDs: exactly one valid booking; competing routine/leave changes follow the same protocol, no partial leave approval/cover effects.
- Rejection, cancellation and permitted date amendment reconcile affected future slots atomically with audit and idempotent notifications. Past attendance/history remains unchanged; cancelled/replaced offer cannot authorize a period.
- Confirmed cover appears only on that date in substitute routine/period attendance; nomination and reviewed-but-unaccepted offers grant no attendance rights; weekly routine byte/row state unchanged.
- Payroll/salary/expense/adjustment tables unchanged by all cover transitions; no coaching payout fabricated. Preserve existing leave balance/snapshot/cancellation and D87 dependency behavior.
- Four supported institution types and unavailable-module paths; focused API/service/concurrency tests, existing regressions, UI save/reload gates when UI is authorized, required full verification and generated freshness. No tests are claimed executed by this planning review.

## Minimal authorized next action

Owner reviews the proposed placement, exact document edits and unresolved policies. Resolve the gates, then have the owner author and commit a separately numbered Change-Request through the active agent's coordinated workflow. Only after that may canonical sources and generated plans be refined; implementation remains blocked until both dependencies and all scope/security/test gates are accepted. Workflow acceptance is recorded, not promoted to formal approval or runtime readiness.

## Planning verification evidence

`py -3.14 %TEMP%/school-leave-planning-check.py` PASS: workflow/gate coverage, source existence and current schema/conflict-example evidence, no completion marks, identical pre/post shared staged and unstaged diff hashes. HEAD remained d9676d916ea0522d390d1a211db1c65f3b0e8f9f. No shared log/index/spec/runtime edit, application test runner, database access, generator, commit or push. The new review file is intentionally untracked pending owner/active-agent coordination. This focused document check is not repository guard/full suite/feature acceptance.

## Owner planning approval follow-up

On 2026-10-16 owner explicitly approved this planning recommendation: separate leave-linked substitution from Step6.6/R2 into a dependency-ready Phase7 task after accepted routine and teacher leave; allow leave approval with unassigned slots; prohibit conflict override for confirmed cover; prefer D85-compliant cancel/reapply where permitted. The storage/lifecycle/amendment/concurrency/API gates remain unresolved. This approval is planning acceptance only, not an owner-authored Change-Request, separate decision commit, protected edit authorization or executable task acceptance. No decision number is assigned. Coordinate with the active agent before preparing/committing formal decision and any shared canonical changes.

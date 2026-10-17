# Leave-linked substitution operation identity and writer contract

2026-10-17; base e68717c. Design review under D96, not a canonical contract, migration, executable task or implementation acceptance. Preserve the accepted P1-P15 policy, D85 cancellation rules, D87 payroll boundary and R3.6b/R3.7 order. D98 continues to recognize exactly two design-only tables.

## Finding and smallest storage decision

The committed event row requires a non-null slot and version, with unique `(institution_id,user_id,idempotency_key)`. A leave approval/cancellation can affect multiple slots; a source change can affect multiple leaves; an approved leave can have zero routine occurrences. Consequently one incoming key cannot be inserted unchanged in every slot event. A hash derived separately for each slot avoids that collision but does not record the original request's identity, its complete result or a zero-event operation. A changed payload targeting a disjoint slot could then reuse the incoming key undetected. This is a design counterexample, not a reported runtime failure.

`AuditLog` is not an accepted substitute: it has no request-key uniqueness, and `tenant_export_ref.py` deliberately excludes it as a platform-held trail. Existing LeaveService same-state audit comparison is a narrow legacy precedent, not the required request replay contract. Do not change it in this planning work.

| Candidate | Consequence | Recommendation |
|---|---|---|
| Keep the current pair unchanged; reuse incoming key for all events | Unique constraint rejects multi-slot fan-out; no receipt for zero-event work | Reject |
| Keep the current pair unchanged; derive each slot key | No durable root lookup or complete result; changed/disjoint payload reuse escapes detection | Reject as a complete protocol |
| Add root receipt variants to the existing event table | Could retain two tables, but requires nullable slot/version/occurrence fields, explicit root-versus-slot constraints and a result manifest; source-wide requests cannot require one leave/original Teacher | Viable redesign candidate under D96, subject to exact schema and verifier review; not selected here |
| Separate operation receipt from immutable slot events | Clear request identity, zero-event representation and complete fan-out manifest without weakening non-null slot history | Recommended for owner scope review; a third design-only table exceeds D98's exact-pair authorization |

The recommendation is conceptual only. Do not add a table name, DDL, third marker, generator allowance or migration without an owner-authored separate Change-Request extending the exact inventory/tooling scope. No new D-number is assigned here. The owner can instead retain the two-table limit and direct review of the root-variant design. Durable notification storage remains a separate unresolved gate; an operation receipt is not an outbox.

## Proposed request protocol for either viable representation

These are proposed technical requirements to refine under D96, not registered HTTP paths, capability strings or error codes.

1. Bind tenant, authenticated actor, explicit department context where applicable, action and route resource from trusted server context. Recheck current authorization before exposing any replay; a receipt does not preserve access after revocation. Do not accept body-supplied actor/tenant or arbitrary conflict-exclusion IDs.
2. Scope incoming request identity to institution plus actor plus opaque key across these mutation actions. Its canonical digest includes action, bound resource, authorized context, normalized payload and expected versions. Define an explicit canonical encoding before implementation; no raw sensitive payload in logs or replay receipts.
3. Begin transaction; acquire the institution row first, before relevant business-row locks. Look up the root receipt. Same identity and different digest is a conflict; same digest returns the committed operation result without another transition, audit, notification intent or version increment. This replay lookup precedes stale-version rejection, so a successful retry does not fail merely because its first execution advanced versions.
4. With no receipt, load fresh actor, source, leave and target prerequisites; lock affected rows in a common order. Recheck source/slot versions, cutoff and conflicts. A fresh stale request fails without partial mutation. Expected versions for leave/source writers require their own exact version contract; do not invent version columns in runtime.
5. Apply the whole leave/source operation atomically, including all slot changes, lifecycle events, audit and the required durable notification intents. Store the root's action/resource identity, digest, minimal result manifest (affected slot/event IDs and resulting versions, including an empty list), and outcome in the same transaction. No committed 'in progress' receipt or partial fan-out. Receipt retention/export/import/purge, actor mapping and result privacy must be defined with the physical representation.
6. Each changed slot gets one final projection version and corresponding immutable event for that transition. Derive child identity from a domain-separated, unambiguous encoding of operation identity and slot identity; validate the final encoding against the 128-character field. Never expose child keys as alternative incoming request identities. Operations without slot changes still have a root result; denied/validation failures do not commit successful receipts.
7. If commit succeeds but the response is lost, replay retrieves that result. If the transaction rolls back, neither root nor child events survive. Bounded deadlock retries rerun the complete transaction with the same identity and refreshed reads. Retry counts/backoff and exhausted-retry response remain an exact API gate. Post-commit delivery retries must use durable intent identity, not repeat business mutations.

## Transition and fan-out inventory

| Operation / actor | Scope and expected state | Atomic effects / conflict behavior |
|---|---|---|
| Applicant nomination set/clear | Own eligible leave occurrence; current slot/source version; before cutoff | Advisory nomination or gap; availability rechecked; no reservation or attendance grant |
| Reviewer leave approval | Bound leave, fresh review authority, no self-review; expected leave plus affected source/slot versions | Approve leave under D85; validate nominations and create explicit offers where eligible; preserve unassigned gaps; one receipt covers all affected slots, including zero |
| Reviewer offer/replace/clear | Approved leave, bound occurrence, current version, future period | Revoke old cover atomically; new target requires acceptance; clearing leaves a gap; no confirmed-cover conflict override |
| Target accept | Own active linked Teacher, current offer and version, approved leave, period not started | Recheck full interval and current sources/leave/blocks/confirmed covers; confirm once or conflict; no stale offer resurrection |
| Target decline | Current own offer and version, before cutoff | Clear target to gap with immutable decline history; does not reject the leave |
| Leave reject/cancel | D85-authorized state and actor, including date/cancel restrictions | Cancel related live offers/covers atomically; preserve history and approved snapshots; no in-place date amendment, use permitted cancel/reapply |
| Substitute leave approval | D85 review plus all affected future cover occurrences | Approve new leave and invalidate incompatible future covers to gaps in the same operation; do not cancel the original applicants' leaves |
| Routine/block/source/eligibility change | Trusted bound source, fresh source versions, all affected future occurrences | Reconcile/invalidate offers and covers, retain history; no automatic retarget of accepted source versions; reject prohibited destructive past edits |

Invalid nomination handling at approval needs exact error-versus-gap API semantics; this packet does not silently choose them. Existing event enums also need a transition-by-transition mapping (including approval without an offer and eligibility invalidation) before any physical refinement is accepted. A zero-effect result must not manufacture a slot event.

## Writer inventory and lock obligations

Current evidence is a bounded source inventory, not an assertion that every indirect writer has already been found. Implementation must audit controllers, imports, jobs, bulk writers, observers and commands that reach each domain, including future ones.

| Domain / observed source | Current evidence | Required participation before exposure |
|---|---|---|
| Leave create/transition: `api/app/Services/Hr/LeaveService.php` | Both transaction entry points acquire institution row; same-state retry compares latest audit; no cover reconciliation | Extend reviewed operation boundary to approval/rejection/cancellation and substitute-leave invalidation; preserve D85 snapshots and restrictions |
| Teacher eligibility: `api/app/Services/TeacherService.php::update/delete` | Transactions can change Teacher status, linked User active flag or soft-delete Teacher; no institution-row lock there | Institution-first lock before changing eligibility; reconcile future offers/covers and preserve historical references |
| User eligibility: `api/app/Observers/UserObserver.php::updated/deleted` and their callers | Observer revokes tokens for sensitive changes; no shared cover lock | Audit all callers; acquire lock at outer transaction before User mutation, not after update in observer; relevant identity/active/deletion changes reconcile; contact-only updates do not imply cover cancellation |
| Academic source: `api/app/Services/AcademicStructureService.php::saveBatch/deleteBatch/deleteSubject/deleteProgram/syncSubjectTeachers` | Changes batch status/teacher links or tears down source structures; no shared institution lock; some paths have transactions | Include outer controllers/direct model writers too; common lock before source changes; affected occurrence discovery and history-safe teardown, never arbitrary body ID exclusion |
| Routine, routine-block, substitution, period attendance | No matching runtime implementation classes found at this checkpoint | Future writers must join protocol at creation, update, delete, bulk/import and reconciliation entry points; absence today is not acceptance |
| Daily staff attendance: `api/app/Services/Hr/StaffAttendanceService.php::save` | Institution-first transaction precedent | Keep boundary distinct from future period attendance; do not claim daily attendance proves dated cover behavior |
| Daily student attendance: `api/app/Services/AttendanceService.php::saveBulk` | Transaction exists; no institution lock observed | No automatic cover-derived access; inspect integration only if future period flow invokes this path |
| Calendar/settings and membership/module changes | `InstitutionSettings`, HR calendar and authorization paths can affect prerequisite reads; complete caller inventory pending | Explicitly classify each setting/revocation as immediate access denial, source invalidation or neither; do not invent retroactive cancellation policy |
| Tenant purge/import and delivery/reconciliation jobs | Operational export currently excludes design pair; no cover runtime job exists | Future accepted integration must preserve dependency order, request/event identities and tenant context; audit purge protocol separately; delivery workers cannot recreate superseded covers |

Proposed common lock order after institution: affected Users ascending ID; Teachers ascending ID; source academic rows by a fixed documented table rank then ID; routine/block rows by fixed rank then ID; leaves ascending ID; slots ascending ID; operation/events/intents. Every path must use the same final rank, including substitute leave across other leaves. Discover affected rows under the institution lock, then lock in that order; recompute/recheck after lock acquisition. No caller may pre-lock a leave, Teacher or routine before entering this protocol. Exact source-table rank remains gated until all future writers are enumerated.

Conflict interval is `start < other.end AND end > other.start`; adjacent periods are permitted. The relevant tenant, date, teacher, class/room and full occurrence containment must be tested. Exclude only the trusted current source occurrence, not every same routine or an input-selected ID. Serialization prevents races only if every writer participates. Two-connection MySQL tests must prove overlapping accepts across different routine IDs and accepts versus leave/block/source/eligibility writers; SQLite uniqueness probes are not that proof.

## Verification and next gate

Focused check: `py -3.14 %TEMP%/school-D96-operation-proof.py` reproduces the current unique-key multi-slot failure with transaction rollback, demonstrates disjoint child-key request reuse, verifies live audit exclusion and source lock evidence, and verifies all pre-existing dirty files unchanged before own log append. It does not test proposed receipts or runtime concurrency, notification persistence, HTTP behavior or MySQL locking.

Next safe action: owner chooses separate receipt versus two-table root variant. A separate receipt needs a new explicit design-only scope decision before canonical schema/tooling edits. Continue exact API/key mapping only against the selected representation; no runtime or executable plan work. R3.6b remains incomplete.

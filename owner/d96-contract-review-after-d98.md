# D95/D96 contract review after D98

2026-10-17; evidence base 91b0edf. Review checkpoint only. No existing canonical draft or runtime file changed; no task executable/complete. The approved D96 design scope already permits exact canonical contract refinement; this review does not ask for a redundant policy Change-Request or grant implementation authority.

## Reconciled status

D95 authorizes the six-file planning alignment. D96 authorizes design-only storage/API/capability/writer-contract refinement and source dependency alignment. D97 export direction is superseded narrowly by D98's design-only distinction. D98 tooling and the specifically adopted D96 schema/source prerequisites are committed/pushed in 91b0edf. Operational export has129 tables; the two design-only tables remain separate; full SQL/FK validation is retained.

Remaining dirty changes combine D94 teacher-index runtime/contracts and D95 planning drafts. They are not accepted merely because D98 passed. Existing owner reconciliation is historical evidence; its earlier deep failure is resolved for the D98 committed scope, while its earlier broad PASS is not proof of these remaining drafts. No app/runtime workflow or dependency acceptance follows.

## Findings requiring contract refinement

| Priority | Evidence | Required resolution before implementation |
|---|---|---|
| Blocking | docs/API.md and docs/AUTHORIZATION.md have no exact D96 leave-linked action/path/payload/key contract. Current module text labels historical generic Admin substitution routes non-contractual; generated full draft retains those six historical routes. | Define the approved leave-rooted action contracts and actor/context rules under D96; identify how canonical source generation consumes them. Do not register routes or extend runtime key catalogs from a draft. Regenerate only from approved sources; generic draft routes are not acceptance. |
| Blocking | schema.sql unique_leave_substitution_event_request is unique(institution_id,user_id,idempotency_key), and one event represents one slot/version. Approval/cancellation/source reconciliation can affect many slots. | Specify request-level identity versus per-slot derived event keys, replay lookup, changed-payload rejection and atomic fan-out. Reusing one inbound key unchanged for multiple event rows violates uniqueness; changing keys without a request-level replay contract can lose cross-action collision protection. This is a design ambiguity, not an observed runtime failure. Do not weaken the unique key or add storage without a reviewed contract. |
| Blocking | Current LeaveService locks the institution row, but no routine/block/cover/period-attendance runtime implementation exists. TeacherService can deactivate/delete a Teacher; AcademicStructureService can mutate source academic structures. | Build an explicit current/planned writer inventory with bound tenant, institution-first lock order, rows/version, invalidation and retry rules. Include target eligibility changes and source teardown paths; distinguish fresh read denial from durable gap reconciliation/notification. Do not claim all-writer participation from LeaveService alone. |
| Required | D95 module drafts still say physical storage/export policy is entirely undefined and needs a new CR; D96/D98 now authorize/design these areas. | Replace stale gate wording with exact accepted design references and the remaining implementation/dependency gates. Preserve the logical-only/executable prohibition; do not call technical direction runtime acceptance. |
| Required | routine.md update example excludes data['id'] from conflict checks. | Document that excluded ID comes from the trusted, tenant-bound route/model being updated, never an arbitrary body ID. Require current source version and no caller-selected conflicting row exclusion. This is a documentation example risk; no routine runtime bug is claimed. |
| Required, separate D94 scope | In both API.md and AUTHORIZATION.md, the new uncommitted D94 heading appears between the D93 heading and its paragraph. | Restore section ownership when the D94 draft is reviewed/adopted. Do not stage that unrelated draft as part of substitution work. |
| Pending gate | Durable notification intent, delivery deduplication and post-commit retry are required by policy; exact primitive is not specified. | Define what is durable atomically with the transition, recipient/channel identity and retry/cancellation rules. An event audit alone is not a proven delivery mechanism. Reuse accepted primitives where possible; no runtime/outbox implementation in this design checkpoint. |

## Proposed smallest next design update

One bounded D96 design update should define operation identity/idempotency and the writer-lock inventory first, because API fan-out and history semantics depend on them. Produce a canonical transition/operation table with actor, bound leave/slot/date, expected version, idempotency scope, events emitted, invalidation, result/error and replay behavior. Pair it with the writer inventory; then derive exact action-to-capability/API payload contracts. Preserve D85 cancellation/snapshot semantics, approved P1-P15, no self-review and no automatic payroll change.

Before choosing a storage adjustment, explicitly evaluate whether the existing slot/event design can satisfy request-level fan-out/replay without extra physical storage. Any candidate must prove same-key/different-payload rejection, safe retry after partial delivery, leave-wide atomicity, deterministic per-slot event identity and concurrent independent requests. No resolution is silently adopted by this review.

Keep institution-local/date-bound confirmed-only attendance and weekly routine immutability. Scope remains design only; module/type defaults, exact key catalog, source generator compatibility, accepted dependencies and executable task approval remain distinct gates. No task IDs, migrations, source-plan activation or runtime work.

## Preservation and verification limits

This artifact and selectively appended own handoff/progress evidence are the only changes made by this review. Existing D94 runtime/API and D95 canonical drafts, original owner log edits, untracked files and caches remain untouched. Focused static evidence checks validate the current unique key, missing runtime controllers, current lock precedent, section interleaving and unchanged existing dirty bytes. These are not HTTP, concurrency, persistence or notification tests. No database, app tests or generator run is required for this review; required implementation checks remain unfulfilled.

Focused command: `py -3.14 %TEMP%/school-D96-review-proof.py` PASS source gap probes and every prior dirty byte unchanged before own evidence append; index initially empty. No app/database/concurrency/generator/deep run in this review. Separate checkpoint staged scope will be only this artifact and own handoff/progress suffixes, checked by the repository guard before commit.

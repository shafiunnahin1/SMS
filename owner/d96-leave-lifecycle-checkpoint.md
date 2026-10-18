# D96/D99 leave lifecycle design checkpoint

2026-10-17; base08122ff. Design-only canonical schema/contract refinement under existing D96 and D99; no migration/backfill, app database access, runtime, UI, delivery or executable task. R3.6b remains incomplete.

## Resolved design gaps

- Nullable tenant-bound initiating leave FK in operation receipts permits lost-response replay of zero-slot leave creation. It does not constrain collateral child events to one leave.
- Slot uniqueness is tenant/leave/routine/date, so cancelled old cycles keep their IDs/history while a new leave receives distinct slots. Cross-leave non-cancelled occurrence exclusion remains a required service check under the institution lock, not a SQL booking guarantee. Existing D85 pending/approved leave overlap checks remain.
- slot_created and leave_approved events plus non-null result_status record initialization/final state without misusing invalidation history. Composite slot/tenant/leave identity prevents an event claiming another leave even inside the same tenant. All earlier event/version/request/receipt/actor constraints remain.
- Creation materializes unassigned future real-source slots; nomination follows as a separate pending action, so invalid nomination does not discard valid leave data (finalized P2). Exhaustive explicit reviewer choices create offers only after approval; a newly unavailable legitimate target becomes a gap with reviewer-visible reason (finalized P3), never automatic confirmation. These are existing accepted policies, not new owner decisions.
- API/module docs specify whole-set scope fingerprints, one final event/version per changed slot, D85 snapshot/cancellation constraints, atomic substitute-obligation reconciliation and distinct cancel/reapply history. Existing leave authorization is unchanged. No fabricated historical periods from today's schedule.

Remaining gates: same-leave source refresh after invalidation, exact resource/department binding and read/picker contracts, source/settings classification, complete writer inventory, safe portable receipt rebinding and durable notification primitive. Dependencies and all runtime/security/real MySQL race/delivery tests remain unaccepted. No task is executable or complete.

## Verification

`py -3.14 infra/spec-verify/test_design_only_schema.py .`:20 PASS (15 retained,5 lifecycle/constraint additions). New checks cover zero-slot initiating leave and tenant FK; creation/approval result-state history; same-tenant wrong-leave event rejection; distinct cancel/reapply IDs with old history unchanged and duplicate same-leave occurrence rejection; and separate active-occurrence query obligation. These are SQLite design/constraint probes, not complete implemented approval or MySQL lock proof.

R1/R3/full generators --check all fresh; export --check fresh129/22excluded, --roundtrip258rows/0problems; node infra/check-schema-parity.mjs139copies/189definitions/0divergence; gen_invariants.py --check fresh and invariants.tsv unchanged. No generated artifact requires a diff. `py -3.14 %TEMP%/school-D96-lifecycle-stage.py`: PASS key/state/FK/P3 source evidence and all18 pre-existing dirty prefixes preserved; seven own source/doc paths selectively staged, unrelated D94/D95 drafts excluded. Initial guard --msg-file %TEMP%/school-D96-lifecycle-msg.txt PASS0/0; diff check clean.

Exact index snapshot1296 files PASS raw-or-filter-normalized Git blob identity; tested tree17dd9e5dbd442bd46c83d20e1108b486a8e69f9f. Exact snapshot focused suite20 PASS. With Git Bash PATH, PYTHONUTF8/PYTHONDONTWRITEBYTECODE/PYTHONUNBUFFERED, `uv run --offline --with PyYAML --no-project --python 3.14 <index-root>/infra/spec-verify/verify.py <index-root> --deep` =>ALL CHECKS PASSED/3 existing warnings; log `%TEMP%/school-D96-lifecycle-deep.log`. Includes11/11 targeted unique-key proofs and77 hot-query checks. `py -3.14 %TEMP%/school-D96-lifecycle-preservation.py` PASS all18 dirty prefixes and operational metadata/invariants/runtime catalog unchanged. Final append is evidence only; tested source blobs must remain identical through final guard/fetch. This artifact is evidence-only and not part of the canonical source change.

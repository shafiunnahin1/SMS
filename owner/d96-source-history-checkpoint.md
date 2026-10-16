# D96/D99 immutable source context checkpoint

2026-10-17; baseebc18d5. Design-only schema/contract refinement under previously registered D96/D99. No migration/backfill, app database, runtime, UI, delivery, task activation or completion. R3.6b remains incomplete.

## Change

Canonical leave_substitution_events gains source_refreshed and immutable source_program_id, nullable source_batch_id and source_subject_id. Tenant-bound FKs reference canonical programs/batches/subjects; three redundant id/institution identity keys support them. All existing event, receipt, actor, leave, slot and version constraints remain. Actual parent and routine DDL now participates in SQLite fixtures so permissive stubs cannot hide missing composite keys.

Own API/module/routine/testing sections explicitly supersede the prior absent enum/snapshot gate only. Source-changing writers must capture old context before mutation, retain it for invalidation, and copy validated new context only into a new reviewer refresh event/unassigned version. Old accepted history is never joined to today's mutated routine to reconstruct source identity. These are identity snapshots, not frozen display names. Historical parent deletion is restricted; future tenant purge must remove history first. No automatic revival/offer/acceptance or weekly routine rewrite. Read/resource/context/delivery, writer integration, portable import and dependency/runtime acceptance remain gated.

Generated AGENT-PLAN-R1.md changes only three canonical identity-key lines. R3 plan and all JSON/task/operational export metadata remain unchanged. No counts, tasks/order, milestone, pricing or current execution pointer change; all three history tables remain design-only and excluded from operational export.

## Exact verification

- `py -3.14 infra/spec-verify/test_design_only_schema.py .`:23 PASS (all20 previous tests retained,3 new source context/history tests). Foreign/missing context parents and required-null fields rejected, no-batch source allowed, old accepted/invalidation context preserved through changed-routine refresh to a new unassigned target-free version, routine untouched by refresh, historical parents cannot be deleted after routine moves. SQLite design/constraint tests, not real reviewer/transaction/HTTP/MySQL concurrency/delivery implementation proof.
- `py -3.14 infra/spec-verify/gen_agent_plan.py .`, `gen_release_plan.py .`: source regeneration; R1 only three identity-key lines differ, R3 unchanged. Their --check plus gen_full_release.py --check all fresh.
- `py -3.14 infra/spec-verify/tenant_export_ref.py . --check`: map fresh,151tenant/129exported/22excluded/0 unresolved exported IDs. `--roundtrip`:258 rows/0 problems. No export-map change needed.
- `node infra/check-schema-parity.mjs`:139 copies/189definitions/0divergence. `py -3.14 infra/scripts/gen_invariants.py . --check`: fresh; invariants.tsv unchanged.
- `py -3.14 %TEMP%/school-D96-source-history-stage.py`: PASS18 original modified byte prefixes retained, unchanged operational metadata/invariants/R3 outputs, exact seven own source/doc paths staged. Existing D94/D95 changes and untracked files excluded. Initial guard --msg-file %TEMP%/school-D96-source-history-msg.txt PASS0 failures/0 warnings; diff check clean.

Exact index snapshot1298 files PASS raw-or-filter-normalized Git blob identity, tested treea0e9027178ca39f8a805dc04624570ecb00ac2e3. Exact snapshot focused suite23 PASS. With Git Bash PATH/UTF8/no-bytecode/unbuffered, `uv run --offline --with PyYAML --no-project --python 3.14 <index-root>/infra/spec-verify/verify.py <index-root> --deep` =>ALL CHECKS PASSED/3 existing warnings; log `%TEMP%/school-D96-source-history-deep.log`. Includes11/11 unique-key mutation proofs and77hot-query checks. `py -3.14 %TEMP%/school-D96-source-history-preservation.py` PASS18 dirty prefixes and task/order/export/invariant metadata unchanged. Final source-identity/guard/fetch checks precede commit. This report and subsequent own log append are evidence only.

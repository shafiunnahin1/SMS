# D99 receipt design checkpoint

2026-10-17; base1443600, prior separate owner decision451f9f6. Design-only canonical/tooling work; no migrations, application database, runtime, UI, delivery or executable task. R3.6b remains incomplete.

## Change and limits

Canonical schema adds `leave_substitution_operations` with tenant/actor request-key digest uniqueness, request digest and minimal result/count. Events retain non-null slot history and gain tenant/actor-bound receipt linkage plus unique operation/slot. Event result manifests are relational rather than opaque JSON ID arrays. API/auth/module/testing additions define domain-separated key hashes, canonical request envelope, replay-before-stale ordering, atomic multi-leave/zero-slot results, privacy, lifecycle retention and fail-closed future portable import. Receipt is not an outbox. Exact action paths/keys, per-action versions/event mapping, retry budget, notification durability and runtime dependency acceptance remain gates.

Strict inventory now permits exactly three named tables with their correct D98/D99 provenance markers; unknown/wrong/duplicate/missing markers and operational references remain rejected. Full SQL/FK validation remains. Generated full-release/export metadata lists the additional design-only definition; all operational planning/export metadata is identical to HEAD. R1/R3 generators required no changed output. Canonical definitions189; operational186; tenant151; exported129; excluded22.

Existing D94/D95 canonical and runtime drafts are not adopted. Own appended API/AUTH/TESTING/module sections are staged as HEAD plus own suffix only. All18 prior modified byte sequences are retained (unchanged bytes, or exact prefix where an own section was appended). Original shared log deltas and user untracked files remain outside the checkpoint.

## Exact checks

- `py -3.14 infra/spec-verify/test_design_only_schema.py .`:15 PASS (8 existing inventory/export tests retained,1 receipt inventory mutation test,6 executable receipt design-model tests). Model uses the three actual DDL definitions translated to SQLite with minimal parent fixtures; tests request identity, multi-leave fan-out, zero-slot, stale replay, rollback and FK/unique boundaries. Not HTTP, authorization, real MySQL concurrency or notification proof.
- `py -3.14 infra/spec-verify/gen_agent_plan.py . --check`, `gen_release_plan.py . --check`, `gen_full_release.py . --check`: all fresh. `gen_full_release.py .` regenerated affected full artifacts from sources; no task/order/milestone or other audit metadata change.
- `py -3.14 infra/spec-verify/tenant_export_ref.py . --write`, `--check`, `--roundtrip`: fresh map,129 exported/22 excluded,258 rows imported,0 problems; only design-only list differs.
- `node infra/check-schema-parity.mjs`:139 copies against189 definitions,0 divergence. `py -3.14 infra/scripts/gen_invariants.py . --check`: fresh; invariants.tsv unchanged.
- `py -3.14 %TEMP%/school-D99-design-preservation.py`: PASS all operational metadata unchanged and all18 original modified prefixes preserved. First ad-hoc metadata read failed Windows default decoding; explicit UTF-8 corrected the probe, no source/test weakening.
- `py -3.14 %TEMP%/school-D99-index-snapshot.py`: PASS1294 checkout-index files, raw-or-filter-normalized Git blob identity, tested source tree35e17fbb43e08e741f93d32e145b0647494257dc. Exact tracked snapshot excludes unrelated dirty drafts and untracked dependencies.
- `py -3.14 infra/guard/agent_guard.py --staged --msg-file %TEMP%/school-D99-design-msg.txt`: PASS0 failures/0 warnings before evidence append; `git diff --cached --check`: PASS.

Exact snapshot deep verification completed with Git Bash PATH and UTF-8/no-bytecode environment, command `uv run --offline --with PyYAML --no-project --python 3.14 <index-root>/infra/spec-verify/verify.py <index-root> --deep`, log `%TEMP%/school-D99-index-deep.log`. Result: ALL CHECKS PASSED /3 existing warnings. Exact snapshot focused suite also15 PASS. Final evidence-only append retains all tested source blobs; final guard/fetch gates precede commit.

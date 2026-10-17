# D103 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D102 row)

Owner answered in chat on 2026-10-17: "let the checker skip ADD CONSTRAINT" (docs/BLOCKED.md, 2026-10-17 "verify.py . --deep crashes on schema.sql").

| D103 | R3.6b spec-verify repair after the D101 schema | Owner approved (2026-10-17). (1) The SQLite translators in `infra/spec-verify` and `infra/scripts` (tenant_export_ref, plan_check, partition_readiness, verify, gen_invariants, perf-check, sqlite_shim) skip `ALTER TABLE <t> ADD CONSTRAINT ...;` statements; the MySQL schema and migrations keep the `institutions.switched_by` foreign key unchanged. (2) Bring the D101 table `staff_mapping_reviews` into the documented inventory (`docs/DATABASE.md` operational grouping and its migration-inventory entry) and regenerate the generated files with their own tools only: `tenant_export_ref.py . --write`, `gen_agent_plan.py .`, `gen_full_release.py .`, the R3 scope/plan generator, and the release table counts. No hand edits to generated files; no other spec change. |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad docs\LOCKED-DECISIONS.md
    # paste the row above on a new line right after the "| D102 |" row, save, close
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D103 spec-verify repair after the D101 schema" -m "Change-Request: D103"
    git push origin claude/elegant-cori-gw2mw5

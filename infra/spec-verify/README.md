# spec-verify

`python3 infra/spec-verify/verify.py` re-runs the verification of this **specification**. It needs Python 3 (+ sqlite3); Node and `tsc` are used when installed.

It does: execute `schema.sql` in SQLite; check uniqueness/FK behaviour; cross-check module keys (config ↔ routes ↔ menu ↔ index); resolve every file reference; scan for claims later decisions superseded; run `lint:theme` and the schema-parity guard over the docs' code blocks; syntax-parse every JS/JSX block; reproduce the payroll golden numbers.

It does **not** run PHP, MySQL, a browser, or any test from `docs/TESTING.md` — none exist yet. A green run means "the spec is internally consistent", not "the software works".

Run it after every spec change. When the build starts, the real CI (`php artisan test`, `npm test`, `npm run lint:theme`, `node infra/check-schema-parity.mjs`) replaces most of it.

## Revision 12 additions
`refs_r11.py` / `refs_r12.py` — independent calculations (money, HMAC, lottery, risk, ledger vs cash book, contrast …) the module docs' numbers are checked against. `tenant_export_ref.py` — export → import-as-NEW prototype on the real schema (`--check`, `--roundtrip`, `--selftest`, `--write` regenerates `docs/database/tenant-export-map.json`). `verify.py` runs all of them plus the structural checks; each check was proven live by injecting a defect.

## Revision 13 additions
`mysql_lint.py` — static MySQL 8 lint of `schema.sql` (what SQLite forgives). `prove_invariants.py` (`verify.py --deep`) — each UNIQUE key targeted by `infra/scripts/invariants.tsv` is guarded by exactly one test. The database-behaviour tests and the real-MySQL smoke script live in `infra/scripts/` (`mysql-smoke.sh`, `gen_invariants.py`, `schema-diff.sh`); `docs/spike/SPIKE-RUNBOOK.md` says when to run them.

## Revision 14 additions
`plan_check.py` — does the index design serve the hot queries in `infra/scripts/hot-queries.tsv` (no full scan, leading filter and date range inside the index, ordered lists need no sort)? Models InnoDB's automatic foreign-key indexes. `infra/scripts/perf-check.py` is its real-MySQL counterpart (seeds ~11M rows at SCALE=1, EXPLAIN + timing); `verify.py --deep` runs its SQLite dry run.

## Revision 15 additions
`partition_readiness.py` — what partitioning each fast-growing table would need (PK / unique keys / foreign keys); `verify.py` pins decision D41 to its output. `verify.py` also scans every PHP sample for hard-coded disks, `LIKE` on dates, unguarded bulk writes, and checks `docs/architecture/file-storage.md` covers every file-bearing column of the schema.

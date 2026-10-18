# R2.1.0 baseline — shafiunnahin1/qbank (D109)

Measured 2026-10-18 by the agent, under owner decision D109. **Status: for owner review; R2.1.0 is accepted only by the owner.**

## Source and environment
- Source: `shafiunnahin1/qbank` at `40f769c966c90217de654e7fad846b2ac5cfb980` (branch `feat/occurrence-sources`), exported with `git archive` into the agent's sandbox. The qbank checkout was not modified; nothing was committed or pushed to qbank.
- Removed before anything ran, never opened: `remote-qbank-env.env`, `.env.backup-*`, `academic_sync.sql`. Config came only from `.env.example` (SQLite, `MAIL_MAILER=log`).
- Runtime: PHP **8.4.26** in a container started with `--network none` (no outbound calls possible). qbank's lock file needs PHP ≥ 8.4.1; the sandbox's own PHP is 8.3, so Composer downloaded the locked packages on the host with `--ignore-platform-req=php` and they ran only on 8.4.
- Database: fresh SQLite file; `php artisan migrate --seed` → 131 steps DONE in ~2 s (qbank's own seeders only). Tests use phpunit.xml's SQLite `:memory:`.
- Not available in the sandbox: the PHP **GD** extension (the network policy blocks the Debian package mirrors, so it could not be installed), MariaDB/MySQL for qbank, a browser runner for `tests/Browser/*.mjs`.

## Results
| | count |
|---|---|
| Routes (`route:list`) | **251** — `source-routes.json` (academic 62, exams 25, institutions 22, pdf-extractor 17, questions 17, omr 15, super-admin 14, question-sets 10, question-paper 9, ai-json 8, wallet 8, …) |
| PHPUnit tests | **820** — 771 passed, 49 failed, 18.2 s total |
| failed: environment | 8 — GD extension missing (QuestionMediaOwnershipTest 5, QuestionCreateMediaLifecycleTest 3) |
| failed: source | 41 — assertion failures in qbank itself; some may be SQLite-vs-MariaDB effects (qbank's own reports use MariaDB); not diagnosed here |

By area (passed / failed): editor 610 / 35 · import (AI-JSON, QMX visual, structured) 30 / 13 · PDF staging/extractor 18 / 0 · payment/wallet/subscription 76 / 0 · curriculum 4 / 1 · other 33 / 0.
Largest failing groups: StructuredQuestionImportTest 9/10, fill-gap/rearranging browser-contract tests 7, QuestionInteractionTypeMetadataSeederTest 4, QuestionInteractionProjectionTest 4, QuestionAuthoringEnvironmentTest 3, QuestionAuthoringProfileTest 3, AI-JSON prompt/schema contract tests 4.

Every test has a stable fixture ID (`R21-<AREA>-NNN`) with status, time and failure reason in `test-baseline.json`.

## Timings
Test timings are for qbank's small built-in fixtures only (whole suite 18 s; PDF staging/finalization tests 0.02–0.18 s per class; structured import 0.22 s). They are **not** volume or production-like performance numbers.

## Not measured (and why)
- **OMR**: qbank has 15 OMR routes but no OMR tests and no sample answer-sheet scans in the repo; measuring it needs real or owner-approved sample scans. → not measured.
- **PDF extraction on real papers / OCR**: only the staging/finalization tests ran; real extraction quality needs sample PDFs. → not measured.
- **Import at scale (10k questions, TOON)**: no large fixture exists; R2.1.3 asks for one. → not measured.
- **Browser runtime tests** (`tests/Browser/*.mjs`, Playwright-style): need the built frontend and a running server with MariaDB. → not run.
- **Media upload paths needing GD**: 8 tests, environment only.
- **Payments (bKash) against the real gateway**: only sandbox/fake-gateway tests ran (all passed); live gateway calls are forbidden by D109.
- **MariaDB behaviour**: qbank was run on SQLite only.

## What the owner decides next
1. Accept this baseline (R2.1.0), or ask for more (e.g. provide sample OMR scans / PDFs, or allow a MariaDB run).
2. Whether the 41 source failures matter for the move (they are qbank's own open issues, not School Management's).
3. Then a refined-scope decision for R2.1.1 (identity, roles and portals) before any code.

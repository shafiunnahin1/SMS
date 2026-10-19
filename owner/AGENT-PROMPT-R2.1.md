# Prompt for the next coding agent (R2.1 continuation)

Copy everything below the line into the new agent's first message.

---

You are continuing the R2.1 "qbank → SMS" work in this repository (Laravel 12 API in `api/`, React/Vite in `frontend/`). Work exactly the way the previous agent did, as summarised here. Read `AGENTS.md`, `docs/ops/agent-guardrails.md` and the last 60 lines of `docs/PROGRESS.md` first; do not read the whole docs tree.

## Where things stand (2026-10-19)
- `main` = `9c51283`. R2.1.1 to R2.1.5 are built and owner-accepted (`[x]` in docs/PROGRESS.md).
- Next: **R2.1.6 OMR**, scope = decision **D127** in `docs/LOCKED-DECISIONS.md` (read that row; it is the spec). The guard already allows task `R2.1.6`, tables `qb_omr_forms` and `qb_omr_scans`, and pinned copies in `frontend/public/vendor/pdfjs/` and `frontend/public/vendor/heic2any/`.
- Then R2.1.7 (exams/marks from OMR), R2.1.8, R2.1.9: each needs an owner decision first (see "Decisions" below).
- The source app is qbank at `../qbank` (read-only). NEVER read any `.env*`, `remote-qbank-env.env`, `*.sql` dumps or credential files there; no network calls to its servers. Use an Explore sub-agent to study a qbank feature and report file paths and rules; copy its rules, not its Blade markup.

## Work loop (one slice at a time)
1. Sync: `git fetch origin main && git checkout -B claude/<branch> origin/main` (after the owner merges).
2. Build one small slice (one table + its API, or one screen). Keep the existing pattern: Controller → (FormRequest) → Service; tenant models use `BelongsToInstitution`, platform question-bank models use `PlatformCatalogue` + `TENANT_READ`.
3. Tests: write a Feature test for the slice and run ONLY it while iterating (see Testing).
4. Before committing, run the full API suite once, plus `npm test` and `npm run lint:theme` if the frontend changed.
5. Add a `docs/PROGRESS.md` line (what, files, tests with counts, the full-suite count). Log any interpretation in `docs/DECISIONS.md` (one line: date · task · question · chosen · why · spec).
6. Commit with these trailers:
   `Task: R2.1.6` · `Change-Request: D127` (needed whenever schema.sql or another protected file changes) · `Co-Authored-By: …` · `Claude-Session: …`.
   Run the guard first and look at its exit code. Don't pipe the guard through `tail`, which hides failures:
   `python3 infra/guard/agent_guard.py --staged --msg-file <msgfile>; echo exit=$?`
   C4 "unknown controller" warnings are expected; any FAIL must be fixed.
7. Push the branch. The OWNER merges to `main` with PowerShell (`git merge --no-ff origin/<branch>`). Never merge, force-push, amend or rewrite history yourself.

## Testing (do not waste time)
- Services first: `service mysql start; service redis-server start` (they stop when the container restarts; "Connection refused" means restart them, then run `php artisan migrate -q`).
- While iterating, run one file: `php artisan test tests/Feature/QuestionBank/XxxTest.php`. Run a filter group only when you touch shared registries: `--filter='RoleMatrix|DepartmentRoute|TenantIsolation|CrossTenantRoute|QuestionAnswerNeverLeaks|ModelInventory|Schema|TenantPurge'`.
- Full suite (~4.5 min, about 1,000 tests) only once per commit: `timeout 590 php artisan test 2>&1 | grep -E "Tests:|FAILED" | tail -3`. If something fails, rerun just that test with `--filter`.
- Frontend: `npx vitest run` (~30 s) and `npm run lint:theme` once per frontend commit.
- E2E: only the spec for the page you changed, one project: `npx playwright test e2e/<spec>.js --project=school-desktop`. Central-host specs must be added to `testIgnore` for the other two projects in `playwright.config.js`. Before e2e, start `php artisan serve --port=8000`, `npx vite --host 0.0.0.0` and, for queued work, `php artisan queue:work redis --queue=default,sms,notifications`. If the login helper fails with `undefined` codes, `api/storage/logs/laravel.log` is too big: keep its last 2,000 lines (it is git-ignored).
- When a test fails, fix the CODE. Never weaken, skip or delete a test, and never overwrite an existing test file: `ls` the name first (an earlier agent once overwrote `QbImportTest.php` and the guard caught it).

## Registries every new route needs (they fail the suite otherwise)
- `api/tests/Fixtures/role-matrix.php`: `'METHOD api/v1/...' => [roles]`.
- `api/app/Support/DepartmentRouteCatalog.php`: append to the **`D111` list**, never to `CAPTURED`, which D90 seals. Use approval `D127` and `staff_mode` `preserve_nonstaff_boundary`. Do not add staff permission keys; protect institution routes with `role:admin,teacher`.
- Routes with an `{id}` on an institution host: add a row in `tests/Feature/TenantIsolationTest.php` (a seed of another tenant's row). If the id is not a tenant row, add it as `=> null` there and to `NOT_ROW_IDS` in `tests/Feature/Security/CrossTenantRouteTest.php`.
- Find the record first, then validate the body, so another tenant's id gets 404, not 422.
- New tenant table: add it to `TenantPurgeService::ORDER` (children before parents).
- New platform model: add it to `tests/Unit/ModelInventoryTest.php`.
- Code that reads `QbQuestion` or option correctness: add it to the DIRECT allowlist in `tests/Feature/QuestionBank/QuestionAnswerNeverLeaksTest.php` with a reason, and never return answers.
- Schema: add each table to `docs/database/schema.sql` AND write a new migration (append-only). An FK to a table defined later in schema.sql: leave it out of both.
- Error codes go in `api/lang/{bn,en}/errors.php`, UI text in `frontend/src/i18n/{bn,en}.json`. Most namespaces sit under the top-level `app` object; menu labels go in `nav`. Insert keys as text next to an existing key; never rewrite the whole JSON file. Every menu icon must exist in `frontend/src/layouts/parts/navIcons.js`.
- Frontend rules: no colour hex values, no `console.log`, no left/right classes (use `ms-`/`me-`/`ps-`/`pe-`/`start`/`end`), text through `t()`; uploads use `multipart` from `features/students/formData`; `ConfirmModal` has role `alertdialog`.

## Decisions (owner)
- A new release task, table, package or protected-file change needs a D-row written by the OWNER.
- You draft it in `owner/decision-D1NN.md`, using the same format as `owner/decision-D127.md` (one table row plus the PowerShell steps), commit it and tell the owner in Bangla.
- After the owner pushes the row, make a separate guard commit: `R21_APPROVED`, `R21_TABLES` (and `PINNED` for vendored files) in `infra/guard/agent_guard.py`, then `python3 infra/guard/test_guard.py`. Ask the owner to merge it to `main` before any implementation commit, because CI runs main's guard.
- The owner often forgets to save the pasted row. Check with `git show origin/<branch>:docs/LOCKED-DECISIONS.md | grep -c "^| D1NN |"`.
- Third-party browser files are copied unchanged into `frontend/public/vendor/<name>/` with `MANIFEST.sha256` and a Vitest manifest test (see `TesseractVendorManifest.test.js`). GitHub raw downloads are blocked here; use `npm pack` or a sparse `git clone`.

## Talking to the owner
- Write to the owner in Bangla, short and plain, with exact PowerShell commands.
- Report what was built, the test counts, and anything they must decide.
- Never claim a check you did not run.
- When acceptance is given ("R2.1.x গ্রহণ করলাম"), change that task's PROGRESS line to `[x]` with the owner's date and the evidence, in a commit with `Task: R2.1.x`.

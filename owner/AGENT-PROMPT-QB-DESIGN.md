# Prompt for the next coding agents — question-bank screens as qbank (D110 / D133)

Copy everything below the line into the agent. One agent = one step. Do the steps in order and finish one before starting the next.

---

You are working on **School Management (SMS)**, a Laravel 11 + React/Vite multi-tenant app, on the owner's Windows PC.

## Folders
- **SMS repo (you edit and push this):** `E:\Projects\School Management`
- **qbank (the reference you copy the design from; read-only):** `E:\Projects\exam-management`
  - Never edit, commit or run migrations in qbank.
  - Never open `.env*`, `*.env`, `remote-qbank-env.env`, `academic_sync.sql` or any `*.sql` / credential file there.
  - Never connect to qbank's servers.

## Branch and git
- Work on the existing branch `claude/r216-omr-d127`. Start with:
  ```powershell
  cd "E:\Projects\School Management"; git checkout claude/r216-omr-d127; git pull --no-rebase origin claude/r216-omr-d127
  ```
- Allowed: small commits (one slice each), `git pull --no-rebase`, `git push origin claude/r216-omr-d127`.
- Forbidden: force-push, rebase, reset --hard, rewriting history, switching to main, merging (the owner merges).
- Every commit message ends with the trailers `Task: R2.1.5` and `Change-Request: D133`. Use `Task: R2.1.6` / `Change-Request: D127` for the OMR step.
- Before every commit run the guard and check its exit code (do not pipe it into `tail`):
  ```powershell
  python infra/guard/agent_guard.py --staged --msg-file <file>; echo $LASTEXITCODE
  ```
- Every commit also adds one evidence line to `docs/PROGRESS.md` under R2.1.5 (or R2.1.6). Write the commands you ran and the results. Do not check or uncheck any line.

## Read first (once)
1. `AGENTS.md` and `docs/ops/agent-guardrails.md`. The rules G1–G17 bind you.
2. `docs/LOCKED-DECISIONS.md` rows **D110** (reproduce qbank's screens 1:1), **D126** (papers, sets, freeze), **D127–D133**.
   - **D133** is this job: qbank's *Question Set* = SMS *প্রশ্নপত্র (question paper)*; qbank's *Subset* = SMS *সেট (set)*.
   - D133 also sets when a final paper may change: allowed while no OMR sheet of it has been scanned. Then the paper goes back to draft and its frozen sets and OMR layout are discarded. After the first scan it cannot change; the user makes a copy.
3. The last entries of `docs/PROGRESS.md` under R2.1.5 and R2.1.6 (what already exists).

## Hard rules (short)
- **Never edit:**
  - `docs/**`, except `docs/PROGRESS.md`, `DECISIONS.md`, `IDEAS.md`, `BLOCKED.md`;
  - `infra/**`, `.github/**`, `AGENTS.md`, `CLAUDE.md`;
  - golden fixtures;
  - `docs/LOCKED-DECISIONS.md` — only the owner adds rows.
- If you need a new decision, write a draft in `owner/decision-Dnnn-*.md`, tell the owner in Bangla, and stop that part.
- **No new packages** (no jsPDF, html2canvas, etc.), **no new tables**, **no unrelated routes**.
- Every new route must be registered in all of these, or the tests fail:
  - `api/tests/Fixtures/role-matrix.php`;
  - `api/app/Support/DepartmentRouteCatalog.php` (the D127 / D111 lists, *not* the sealed CAPTURED list);
  - `api/tests/Feature/TenantIsolationTest.php` (`{id}` routes);
  - and, if it reads correct answers, the allowlist in `QuestionAnswerNeverLeaksTest`.
- **Tenant isolation:** never use `withoutGlobalScope`. Find the record first, then validate, so another tenant gets 404, not 422.
- **Answers:** a question's answer or explanation leaves the server only through `QbQuestionPublicResource` and only when the institution has bought it (`QbUnlock`).
- **Frontend:**
  - Every text through `t()`, with both bn and en keys in `frontend/src/i18n/{bn,en}.json`.
  - These JSON files use **1-space indent**. Insert keys textually; never re-dump the whole file (it rewrites thousands of lines).
  - No hex colours; theme tokens only (`bg-primary`, `text-primary-fg`, `bg-primary-soft`, `bg-surface-muted`, `text-content-muted`, `text-on-primary`…).
  - No `ms-/me-/ps-/pe-/start-/end-`; RTL-safe classes only.
  - `npm run lint:theme` must report 0 violations.
- **Uploads:** the shared axios client defaults to JSON. A `FormData` upload must pass `multipart` from `frontend/src/features/students/formData.js`, or the file is lost.
- **Never** delete, skip, `.only` or weaken a test. The guard also rejects `test.skip`. Use `playwright.config.js` `testIgnore` instead.

## Testing (be efficient — do not rerun big suites again and again)
- **While iterating:** run only the focused tests, e.g. `php artisan test --filter=QbAllQuestionsFilterTest` and `npx vitest run src/test/<file>`.
- **Once per commit, before pushing:**
  - the full API suite: `cd api; php artisan test`;
  - if the frontend changed: `cd frontend; npx vitest run; npm run lint:theme; npx vite build`.
- **Known baseline failure (not yours, do not "fix" the test):** `QbOmrFormTest > form settings are tenant scoped and versioned` (MySQL JSON key order). Everything else must be green.
- **e2e on this PC:**
  - Playwright's own browser download fails here (antivirus), so use the installed Chrome through a local-only config. Never commit `frontend/playwright.local.config.mjs`.
    ```powershell
    cd frontend; npx playwright test e2e/<spec>.spec.js --config=playwright.local.config.mjs --project=school-desktop --headed
    ```
  - If that file is missing, create it:
    ```js
    import base from './playwright.config.js'
    export default { ...base, projects: base.projects.map(p => ({ ...p, use: { ...p.use, channel: 'chrome' } })) }
    ```
  - A long flow needs `test.setTimeout(180_000)`.
  - On a fresh database no MCQ has a price. A spec that buys questions must first set one as Super Admin (see `e2e/qb-omr.spec.js`).

## Running the app on this PC (lessons already learned)
- **MySQL:** XAMPP control panel → Start MySQL. The DB is `edu_saas`. The test DB is `edu_saas_test`.
- **API:** do **not** use `php artisan serve` when you need PDFs. It strips `TEMP` / `LOCALAPPDATA` from the environment, so Chrome fails with "Devtools could not start". Run from `public`:
  ```powershell
  cd "E:\Projects\School Management\api\public"; php -S 127.0.0.1:8000 ..\vendor\laravel\framework\src\Illuminate\Foundation\resources\server.php
  ```
- **Frontend:** `cd frontend; npm run dev`, then open `http://dhanmondi-school.lvh.me:5173`.
  - School login: `principal@dhanmondischool.edu.bd` / `School@1234`.
  - Super Admin: `http://admin.lvh.me:5173` with `admin@schoolapp.com` / `Admin@1234`.
- **PDF:** `.env` has `PDF_CHROME_BINARY="C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"`. Use forward slashes and quotes. Do not change or print other `.env` values.
- **`migrate:fresh --seed` wipes the local data.** Only run it if the owner agrees, and first back up with `mysqldump ... --result-file=E:\Projects\sms-local-backup.sql`.
- **PowerShell:** inner double quotes get stripped when passed to `php -r` / `tinker --execute`. Write a small temporary PHP file with a single-quoted here-string (`@' … '@ | Set-Content -Encoding ASCII x.php`), run `php x.php`, then delete it.

## What is already done
- **Step 1** (commit `08513a3`): qbank's All Questions page `frontend/src/pages/qb/QbAllQuestions.jsx` with the filter sidebar, cards, select across pages and the floating "প্রশ্নপত্র তৈরি (N)" with the name box. `?paper=<id>` = add questions / update.
  - Server side: `QbPurchaseController@questions` handles multi filters plus `?facets=1`.
  - Test: `QbAllQuestionsFilterTest`.
- **OMR** (D127–D132): form, scan, review, results and the reader live in `frontend/src/pages/qb/QbOmr.jsx` and `frontend/src/features/qb/omrSheet.js`. The e2e `qb-omr.spec.js` is green.

## The steps left (one agent each, in this order)
For every step:
- open the qbank files listed and copy the layout, section order, field order, button names and behaviour;
- rebuild it in SMS's React app with SMS tokens, translations and permissions;
- list every visible difference forced by SMS rules in the PROGRESS line (D110 (3));
- add or extend a feature test and an e2e for the step.

### Step 2 — Question papers grid (qbank `/question-sets`)
- **qbank:** `resources/views/question-sets/index.blade.php`, `app/Http/Controllers/Web/QuestionSetController.php` (`index`, folder actions).
- **SMS:** rework `frontend/src/pages/qb/QbPapers.jsx`. Existing API: `/question-bank/papers`, `/question-bank/paper-folders`, `PUT papers/{id}/folder`.
- **Build:**
  - Header bar with breadcrumb "প্রশ্নপত্র". "নতুন প্রশ্নপত্র" goes to all-questions. A "New folder" input and a "New Folder" button.
  - A grid of cards: serial badge, file icon, name, ⋮ menu with Open / Move (folder tree select) / Delete (confirm; drafts only).
  - Folder cards with Open / Move / Delete (only when empty). Breadcrumbs inside folders, and Back.

### Step 3 — Question paper page (qbank `/question-sets/{id}`) + D133 edit rule
- **qbank:** `resources/views/question-sets/show.blade.php`, `subset-show.blade.php`, `QuestionSetController@show/storeSubsets/destroyQuestion/updateQuestions`.
- **Server (`api/app/Http/Controllers/QuestionBank/QbPaperController.php`):**
  - D133 lets a final paper change while no OMR scan exists: return it to draft, delete its `qb_paper_variants` and unlock / clear its OMR form layout. After a scan → 422 with a clear error key (bn/en) telling the user to copy.
  - Add "remove one question" and "copy paper", only if they are not expressible through the existing `PUT /papers/{id}`. Prefer the existing endpoints, and register any new route everywhere listed above.
  - "সেট তৈরি" (create sets) = qbank's Create Subset. Fields: strategy (options / serial / both), count (with the live capacity check), name scheme (A–Z or ক–ঞ only; qbank's river / flower / fruit lists are not in D126). It finalizes the paper (freeze, as D126).
- **Frontend:** a new paper page replacing the old editor as the main view (keep `QbPaperEdit.jsx` reachable for sections and marks if still needed).
  - Header card: "QUESTION PAPER" label, name, "Nটি প্রশ্ন", status.
  - Buttons in qbank order: মূল সেট প্রিন্ট → OMR তৈরি (or OMR প্রিন্ট / OMR স্ক্যান when a form exists) → প্রশ্ন যোগ করুন (all-questions `?paper=`) → সেট তৈরি.
  - The sets list; question cards with delete, options, সঠিক উত্তর / উত্তর / ব্যাখ্যা.

### Step 4 — Print preview with qbank's Paper Controller
- **qbank:** `resources/views/question-paper/preview.blade.php`. The controller panel is at lines ~1558–1840; the A4 page CSS is at ~1061.
- **Build** a React preview page: an A4 sheet on the left, "Paper Controller" on the right, in this order:
  - প্রিন্ট / PDF buttons.
  - ভাষা.
  - Section Controls: সেকশন, নতুন সিরিয়াল, পেজ ব্রেক, Section order.
  - Header Settings: প্রতিষ্ঠানের নাম, পরীক্ষার নাম, শ্রেণি, বিষয়, সেট কোড, সময়, পূর্ণমান — each with its font-size slider. Header Style. Info/Instructions.
  - Content Visibility: Question / Answer / Explanation / Source.
  - Typography: Font, Size, Weight, Line height.
  - Layout & Extras: Column Line, Margin, Text Box border / bottom line, Add Text Box, Bold / Underline, কলাম লেআউট (1/2/3).
- **Data:** the existing `GET /question-bank/papers/{id}/pdf?format=json&set=&answers=`.
- **Output:**
  - "প্রিন্ট" = `window.print()` with print CSS of exactly the preview.
  - "PDF" = the server Chromium PDF with the same settings sent as parameters. The server Blade must apply them.
  - **No "ইমেজ" button** (it needs a new package; listed as a difference).
- **Keep:** D129 numbering (MCQ and written serials separate), D128 subject headings, and answers only for bought questions.
- **Fonts:** only fonts SMS already loads (D52). If Solaiman Lipi / Kalpurush are not available, offer Noto Sans Bengali / Tiro Bangla / Noto Serif Bengali and list the difference.

### Step 5 — OMR sheet and settings as qbank (Task R2.1.6, Change-Request D127)
- **qbank:** the OMR form print page (`omr/forms/{id}/print`, find its Blade and controller), the settings panel and the sheet.
- **Sheet layout:**
  - Boxed শ্রেণি / রোল নাম্বার / বিষয় কোড / সেট কোড columns, each with a write-in row.
  - Exam-type checkboxes.
  - নির্দেশনা box and the invigilator signature line.
  - "প্রশ্ন | উত্তর" answer tables.
- **Settings panel:**
  - Output: page size, orientation, fit message, Generate OMR.
  - Marking.
  - Title & Subtitle (with sizes).
  - Appearance: font; theme colour applies to titles, boxes and text only — **corner markers and bubble outlines stay black**.
  - Candidate Info: Digital / Manual.
  - Candidate Codes: show + digits per code.
- **Rules:**
  - Change `api/app/Services/QuestionBank/QbOmrGeometryService.php` and `api/resources/views/pdf/qb-omr-sheet.blade.php` together. Print and scan must use the same persisted geometry.
  - Keep the reader rules D131 / D132. Keep the form-code bits (orientation) and the four corner markers.
  - Run `QbOmrGeometryTest`, `QbOmrSheetViewTest`, `QbPaperSubjectGroupingTest`, `src/test/QbOmrSheet.test.js` and the e2e `qb-omr.spec.js`.
  - `src/test/fixtures/omr-photos.json` holds scores measured on the old layout. Keep those tests as they are; they test the scoring rules.
  - Ask the owner to print the new sheet and send phone photos for a new real-photo check.

## When you finish a step
Reply to the owner **in Bangla**, short and plain:
- what changed (by screen);
- the visible differences from qbank and why;
- the tests you ran and their results — honestly, including anything not run;
- what the owner should check on screen.

Then stop. The next step is for the next agent.

# Agent Handoff

This is the resumable work log for any agent. Keep the current snapshot concise and append dated events; preserve older event entries. `docs/PROGRESS.md` remains the authoritative task-completion ledger.

## Current Handoff

- Last checked: 2026-10-13
- Repository: `E:\Projects\School Management`
- Branch: `claude/elegant-cori-gw2mw5`
- Current QB.14 work started from `cdd8007`; the earlier source-parity audit started from `5f7eade`.
- The owner-kept `text.txt` remains untracked and untouched. The parity audit/plan is in `QUESTION-BANK-PARITY-PLAN.md`; this checkpoint contains the QB.14 caption-render fix and its progress evidence.
- Active task: QB.14, still `[ ]`. This checkpoint fixes browser rich-text rendering for the server-allowed `caption` tag. The VS Code browser reached the local login page; the question editor is protected, and no credentials/OTP were used. API/Vite were already running on 8000/5173.
- Verified during this review: `php artisan test --filter='QbRichText|QbPaper'` passed (10 tests, 70 assertions); `npm test` passed (93 tests); `npm run lint:theme` passed (141 files, 0 violations); `npm run build` succeeded with a large MathLive chunk warning.
- Not verified: full backend suite and Playwright E2E for QB.14. Do not mark QB.14 complete until all its generated-plan Done When checks pass.
- Plan/history discrepancy: the current generated plan lists QB.14 before QB.13 and says QB.13 depends on QB.14, but `docs/PROGRESS.md` and commit history show QB.13 implementation before the current QB.14 implementation. Do not reorder tasks or rewrite history; owner must resolve whether the plan was intentionally regenerated after the work.
- Documentation drift to review separately: README/PRODUCT/AGENTS contain statements that no code exists; `docs/BLOCKED.md` retains old QB.11 blocks although progress records QB.11 and later work complete. Do not edit protected docs or rules without the repository's approved Change-Request path.
- Spec verifier from this Windows environment did not complete: it reported reference/vendor-scan noise, 12 violations in extracted documentation examples, and stopped because PyYAML is unavailable. Its successful individual checks are not a full verifier pass.
- The legacy reference repository has not been modified; its inspection was read-only. The integration's plan/code changes are recorded in the later dated events below. Generated Python bytecode from the verifier was removed; existing Python 3.13 cache files were preserved.
- Sync rule: every coherent, verified local checkpoint is to be committed and immediately pushed to `origin/claude/elegant-cori-gw2mw5` before the next change. Keep the active task `[ ]` until its full Done When is satisfied. Do not push broken intermediate edits or overwrite a remote advance.
- Legacy reference checkout: `E:\Projects\exam-management`, branch `feat/occurrence-sources`, commit `40f769c9`, clean when inspected. It is read-only; no tests/app commands were run. Its README is stock Laravel and it has no root `AGENTS.md`/`CLAUDE.md`.
- Parity audit snapshot: source and integration each declare 74 unique question-type slugs; exact slug diff is 0, but semantic/UI metadata parity is unverified. Source has 29 diagram registry families, saved sets/folders/subsets, OMR form/scan routes/models, PDF extraction routes, and AI JSON import routes. The integration has basic paper sets A/B, question/media/table authoring and QB.11 DB import, but QB.11 explicitly skips question sets and OMR. See `QUESTION-BANK-PARITY-PLAN.md` for the full evidence matrix and proposed gates.
- Owner clarification (2026-10-13): legacy `QuestionSet` means question paper (`qb_papers`); `QuestionSetSubset` means a set/variant within that paper; folders organize question papers. Do not plan a separate reusable-question-set module. Source-user/institution mapping for importing those papers still needs approval.
- Scope gate: do not implement source-derived features beyond the generated QB plan until the owner approves the required new decision/spec/plan update. D66 excludes legacy subscription discounts. The legacy source stays untouched.
- QB.14 caption rendering checkpoint: `richText.js` allowlists `caption`, `MathText.jsx` renders it semantically, and `RichText.test.jsx` covers caption text plus dropped `onclick`. Focused test 4 passed, theme lint 0 violations, production build succeeded with the existing MathLive chunk warning. Not implemented here: caption input, table merge/split/editing, or advanced picture placement/transforms.

## Next Safe Action

1. Re-fetch the School Management branch; preserve the untracked `text.txt`.
2. Continue QB.14 in generated-plan order. Next small slice: add a caption text input to the existing table dialog and serialize it through `insertTable()` with text escaping; add a focused formatter/UI test before further table or image work.
3. Do not mark QB.14 complete until its full plan Done When passes, including captioned merged cells, transformed/positioned image, preview/library/PDF round trips, and E2E.
4. Keep the legacy qbank checkout read-only; the D74 approval gate applies only to new features outside the current QB.13/QB.14 plan.

## Event Log

- 2026-10-13 — Repository review: confirmed branch `claude/elegant-cori-gw2mw5` at `0c923ed`, matching the remote at inspection; only pre-existing `text.txt` was untracked. Ran the focused QB.14 backend tests (10 passed), frontend tests (93 passed), theme lint (0 violations), and production build (success; MathLive chunk warning). Full E2E and full API suite were not run. Identified plan/history and stale-documentation discrepancies above.
- 2026-10-13 — Owner set immediate sync cadence: each coherent, verified local update must be checkpoint-committed and pushed to the shared Claude branch before the next update; incomplete task stays unchecked. Updated this protocol and both prompts to match.
- 2026-10-13 — Audited School Management `5f7eade` against read-only legacy qbank `40f769c9`. Static source/route/model inventory confirms saved sets/subsets, OMR, PDF extractor, AI JSON import, and 29 diagram registry families in source; integration's importer explicitly skips sets/OMR. Both question-type seed catalogs have 74 matching slugs (semantic parity not checked). No source tests or app commands were run. Added the evidence matrix/proposed phased parity plan; owner approval is required before protected spec/schema/task-plan changes.
- 2026-10-13 — Owner clarified nomenclature: legacy `QuestionSet` → question paper; `QuestionSetSubset` → paper set/variant. Revised Gate 3/4 and removed the separate reusable-set proposal; legacy paper author/institution import mapping remains open.
- 2026-10-13 — Question-bank parity plan and revised prompts pushed as `986f71c`; post-push fetch confirmed local `HEAD` matched `origin/claude/elegant-cori-gw2mw5`. Only `text.txt` remains untracked and untouched.
- 2026-10-13 — Started QB.14 from `cdd8007`; opened the local app in the VS Code browser, which showed login (protected writer editor requires authentication; no credentials/OTP used). Fixed the client allowlist/render path for server-supported captions. Focused RichText tests: 4 passed; theme lint: 0 violations; production build succeeded with the existing MathLive size warning. Task remains incomplete; next is caption entry in the table dialog.

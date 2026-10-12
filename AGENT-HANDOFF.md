# Agent Handoff

This is the resumable work log for any agent. Keep the current snapshot concise and append dated events; preserve older event entries. `docs/PROGRESS.md` remains the authoritative task-completion ledger.

## Current Handoff

- Last checked: 2026-10-13
- Repository: `E:\Projects\School Management`
- Branch: `claude/elegant-cori-gw2mw5`
- Last confirmed commit: `5f7eade` (`origin/claude/elegant-cori-gw2mw5` matched at the time of inspection)
- At audit start the only worktree item was `?? text.txt`; owner wants it kept. The current checkpoint adds `QUESTION-BANK-PARITY-PLAN.md` and updates the continuity, handoff, and two agent prompts. Do not stage, edit, or delete `text.txt`.
- Active work: source-vs-integration audit and remaining-feature plan. In the generated plan QB.13/QB.14 are both `[ ]`; QB.14 is listed first and QB.13 depends on it. The current plan/history discrepancy is recorded in `QUESTION-BANK-PARITY-PLAN.md`; do not change task order without the owner/guarded process.
- Verified during this review: `php artisan test --filter='QbRichText|QbPaper'` passed (10 tests, 70 assertions); `npm test` passed (93 tests); `npm run lint:theme` passed (141 files, 0 violations); `npm run build` succeeded with a large MathLive chunk warning.
- Not verified: full backend suite and Playwright E2E for QB.14. Do not mark QB.14 complete until all its generated-plan Done When checks pass.
- Plan/history discrepancy: the current generated plan lists QB.14 before QB.13 and says QB.13 depends on QB.14, but `docs/PROGRESS.md` and commit history show QB.13 implementation before the current QB.14 implementation. Do not reorder tasks or rewrite history; owner must resolve whether the plan was intentionally regenerated after the work.
- Documentation drift to review separately: README/PRODUCT/AGENTS contain statements that no code exists; `docs/BLOCKED.md` retains old QB.11 blocks although progress records QB.11 and later work complete. Do not edit protected docs or rules without the repository's approved Change-Request path.
- Spec verifier from this Windows environment did not complete: it reported reference/vendor-scan noise, 12 violations in extracted documentation examples, and stopped because PyYAML is unavailable. Its successful individual checks are not a full verifier pass.
- No source or plan files were changed during the review. Generated Python bytecode from the verifier was removed; existing Python 3.13 cache files were preserved.
- Sync rule: every coherent, verified local checkpoint is to be committed and immediately pushed to `origin/claude/elegant-cori-gw2mw5` before the next change. Keep the active task `[ ]` until its full Done When is satisfied. Do not push broken intermediate edits or overwrite a remote advance.
- Legacy reference checkout: `E:\Projects\exam-management`, branch `feat/occurrence-sources`, commit `40f769c9`, clean when inspected. It is read-only; no tests/app commands were run. Its README is stock Laravel and it has no root `AGENTS.md`/`CLAUDE.md`.
- Parity audit snapshot: source and integration each declare 74 unique question-type slugs; exact slug diff is 0, but semantic/UI metadata parity is unverified. Source has 29 diagram registry families, saved sets/folders/subsets, OMR form/scan routes/models, PDF extraction routes, and AI JSON import routes. The integration has basic paper sets A/B, question/media/table authoring and QB.11 DB import, but QB.11 explicitly skips question sets and OMR. See `QUESTION-BANK-PARITY-PLAN.md` for the full evidence matrix and proposed gates.
- Owner clarification (2026-10-13): legacy `QuestionSet` means question paper (`qb_papers`); `QuestionSetSubset` means a set/variant within that paper; folders organize question papers. Do not plan a separate reusable-question-set module. Source-user/institution mapping for importing those papers still needs approval.
- Scope gate: do not implement source-derived features beyond the generated QB plan until the owner approves the required new decision/spec/plan update. D66 excludes legacy subscription discounts. The legacy source stays untouched.

## Next Safe Action

1. Re-fetch both repos and confirm their revisions; never modify or run write-capable commands in the legacy repo.
2. Follow the generated QB.13/QB.14 ordering/dependencies and resolve any conflict with the owner before continuing those tasks.
3. Obtain owner approval and a guarded D74 specification/plan update before implementing the additional parity backlog.
4. Update this handoff after each meaningful work unit. Update `docs/PROGRESS.md` only when an official task's full Done When is proven.

## Event Log

- 2026-10-13 — Repository review: confirmed branch `claude/elegant-cori-gw2mw5` at `0c923ed`, matching the remote at inspection; only pre-existing `text.txt` was untracked. Ran the focused QB.14 backend tests (10 passed), frontend tests (93 passed), theme lint (0 violations), and production build (success; MathLive chunk warning). Full E2E and full API suite were not run. Identified plan/history and stale-documentation discrepancies above.
- 2026-10-13 — Owner set immediate sync cadence: each coherent, verified local update must be checkpoint-committed and pushed to the shared Claude branch before the next update; incomplete task stays unchecked. Updated this protocol and both prompts to match.
- 2026-10-13 — Audited School Management `5f7eade` against read-only legacy qbank `40f769c9`. Static source/route/model inventory confirms saved sets/subsets, OMR, PDF extractor, AI JSON import, and 29 diagram registry families in source; integration's importer explicitly skips sets/OMR. Both question-type seed catalogs have 74 matching slugs (semantic parity not checked). No source tests or app commands were run. Added the evidence matrix/proposed phased parity plan; owner approval is required before protected spec/schema/task-plan changes.
- 2026-10-13 — Owner clarified nomenclature: legacy `QuestionSet` → question paper; `QuestionSetSubset` → paper set/variant. Revised Gate 3/4 and removed the separate reusable-set proposal; legacy paper author/institution import mapping remains open.

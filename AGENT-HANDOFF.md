# Agent Handoff

This is the resumable work log for any agent. Keep the current snapshot concise and append dated events; preserve older event entries. `docs/PROGRESS.md` remains the authoritative task-completion ledger.

## Current Handoff

- Last checked: 2026-10-13
- Repository: `E:\Projects\School Management`
- Branch: `claude/elegant-cori-gw2mw5`
- Last confirmed commit before this policy update: `70ef727` (`origin/claude/elegant-cori-gw2mw5` matched at the time of inspection)
- Working tree: only `?? text.txt`; owner says it is not important but wants it kept. Do not stage, edit, or delete it.
- Active task: `QB.14`, incomplete. The latest commit implements the server-side rich-text caption/media-id picture handling and PDF rendering. It does not complete the planned table/picture editor workflow.
- Verified during this review: `php artisan test --filter='QbRichText|QbPaper'` passed (10 tests, 70 assertions); `npm test` passed (93 tests); `npm run lint:theme` passed (141 files, 0 violations); `npm run build` succeeded with a large MathLive chunk warning.
- Not verified: full backend suite and Playwright E2E for QB.14. Do not mark QB.14 complete until all its generated-plan Done When checks pass.
- Plan/history discrepancy: the current generated plan lists QB.14 before QB.13 and says QB.13 depends on QB.14, but `docs/PROGRESS.md` and commit history show QB.13 implementation before the current QB.14 implementation. Do not reorder tasks or rewrite history; owner must resolve whether the plan was intentionally regenerated after the work.
- Documentation drift to review separately: README/PRODUCT/AGENTS contain statements that no code exists; `docs/BLOCKED.md` retains old QB.11 blocks although progress records QB.11 and later work complete. Do not edit protected docs or rules without the repository's approved Change-Request path.
- Spec verifier from this Windows environment did not complete: it reported reference/vendor-scan noise, 12 violations in extracted documentation examples, and stopped because PyYAML is unavailable. Its successful individual checks are not a full verifier pass.
- No source or plan files were changed during the review. Generated Python bytecode from the verifier was removed; existing Python 3.13 cache files were preserved.
- Sync rule: every coherent, verified local checkpoint is to be committed and immediately pushed to `origin/claude/elegant-cori-gw2mw5` before the next change. Keep the active task `[ ]` until its full Done When is satisfied. Do not push broken intermediate edits or overwrite a remote advance.

## Next Safe Action

1. Re-run the session-start Git checks from `AGENT-CONTINUITY.md`; another agent may have pushed since this snapshot.
2. Inspect the QB.14 frontend and its E2E coverage against `docs/AGENT-PLAN-R1.md`; continue only within QB.14's scope.
3. Run its focused API, frontend, lint, build, and Playwright checks using the documented safe test environment. Do not reset or migrate any shared/non-test database without explicit owner authorization.
4. Update this handoff after each meaningful work unit. Update `docs/PROGRESS.md` only when the task's full Done When is proven.

## Event Log

- 2026-10-13 — Repository review: confirmed branch `claude/elegant-cori-gw2mw5` at `0c923ed`, matching the remote at inspection; only pre-existing `text.txt` was untracked. Ran the focused QB.14 backend tests (10 passed), frontend tests (93 passed), theme lint (0 violations), and production build (success; MathLive chunk warning). Full E2E and full API suite were not run. Identified plan/history and stale-documentation discrepancies above.
- 2026-10-13 — Owner set immediate sync cadence: each coherent, verified local update must be checkpoint-committed and pushed to the shared Claude branch before the next update; incomplete task stays unchecked. Updated this protocol and both prompts to match.

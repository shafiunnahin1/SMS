# D83 Release 2.1 planning — next-agent handoff

Updated: 2026-10-15 (Asia/Dhaka). This is continuity evidence, not a new specification or permission.

## Authorized state

- Repository: `E:\Projects\School Management`; branch `claude/elegant-cori-gw2mw5`; no new branch.
- Owner D83 commit `8d4f79f` is pushed. Read its full row in `docs/LOCKED-DECISIONS.md` before editing. It supersedes pending-approval language in earlier draft/log snapshots; preserve those historical entries.
- Owner selected Release 2.1 activation planning rather than R3.3 implementation. Approved placement: R2.1 after R3.A and before R4/later milestones, preserving existing prerequisites. Executable R2.1.0 depends on R3.A acceptance.
- Before R3.A, only protected planning/intake reconciliation is authorized. Runtime R3 and its module list stay intact. Application/schema migrations, endpoints/modules/packages, feature implementation, DB writes, payment flow and production activation are outside D83. Source repositories remain read-only; no source DB access, write-capable commands or benchmark execution.
- R3.2 backend completed and pushed as `75705a9`; accepted checks were CashBook 14/126, full API 586/10,515, frontend 105/105, theme 142/0, reference 56/56, query-plan 71/0, deep PASS/3 existing warnings, guard 0/0. These are previous accepted evidence, not new tests in this handoff checkpoint. App/demo DB migration and UI were not performed. R3.3 has not started.

## What exists and what remains

- Root `RELEASE-2.1.md` is an exact imported draft from `E:\Projects\SMS\RELEASE-2.1.md` (SHA-256 `872d9ec3515fca3fd350f6210b496cb1b87ad21e840bf42bb7e9538e0f55dc54`), imported in `603e9a1`; preserve root draft/provenance.
- `RELEASE-2.1-INTEGRATION.md` records authority, QB overlap, provisional intake and blockers. `owner/release21-activation-decision.md` was prepared in `9fa1c07`; its placement/planning scope is now approved via D83.
- **Not yet created:** `docs/RELEASE-2.1.md`, `docs/release/r21-scope.json`, `docs/release/r21-plan.json`, `docs/AGENT-PLAN-R2.1.md`. No D83 roadmap/instruction/generator/guard/verifier edits have started. Planning Done When remains incomplete.
- Source traceability claims, 32 diagram/27 graph counts, import capacities and OMR accuracy are unverified proposal/audit claims until current source evidence is collected. Never infer editability from registry membership, persistence from visible UI, or successful import from a parser alone.

## First safe work unit

1. Read AGENTS/CLAUDE/guardrails, AGENT-CONTINUITY, current AGENT-HANDOFF, D83, owner draft, imported release/integration note and QUESTION-BANK-PARITY-PLAN. Reconcile current QB code/history and task ledgers; note historical snapshots explicitly.
2. Fetch and compare branch/remote with this handoff checkpoint. Preserve all local changes. Owner previously confirmed sole-agent ownership; ensure the handoff transfer does not leave two agents editing. Do not reset/rebase/force-push or blindly pull across a dirty file.
3. State task, hypothesis, smallest protected change and falsifying check. First recommended slice: reconciled protected release specification plus traceability/gap/blocker mapping, carrying `Change-Request: D83`. Keep imported root bytes intact and mark unresolved entities/routes/roles/capabilities blocked rather than inventing them.
4. Then define the approved release scope/generated plan and exact tasks/dependencies, and update required generation/verification/guard support in separately verified checkpoints. Preserve current checks and enforce R3.A/future acceptance prerequisites; a new release label must not bypass activation checks. Task IDs/refinement must map to the approved specification. D83 permits necessary protected planning changes, so do not request the same approval again.
5. Align roadmap/sequence and relevant instruction entry points with D83 and accepted R3 transition. Preserve earlier R1.1/R2 dependencies and existing completed QB behavior. No executable feature checkoffs before their actual Done When passes.
6. Each coherent checkpoint: focused checks, handoff/progress, relevant guard self-tests if changed, full deep verifier for protected spec/tooling changes, staged guard, fetch/compare, commit and push before the next update. Use D83 trailer; do not invent an active Task ID for documentation-only work.

## Preservation and blockers

- Existing **unstaged user change**: `docs/BLOCKED.md` contains a TOON blocker added before draft intake. Working-file Git hash is `ad2bfbc64b603e52d291607793010b0c8626efe1`. Do not stage, overwrite or resolve it implicitly. D83 only permits planning; TOON canonical schema/parser/staging/selected persistence/permissions/acceptance still need approved refined task/spec scope before implementation.
- Preserve untracked `text.txt`, `owner/decision-D78.md`, `owner/decision-D79.md`, `owner/decision-D80.md` and existing `infra/spec-verify/__pycache__` files (3.14/3.15 variants). D78 wallet remains unapproved/reserved.
- QuestionSet maps to destination question paper `qb_papers`; subset maps to paper variant and folders organize papers. No duplicate auth/student/exam/result/wallet/payment system.
- Keep unresolved role mapping, visual ownership/editability, Google/OCR inputs, OMR baseline/result mapping and legacy paid rights/balance settlement explicitly blocked for dependent tasks. Do not request/expose secrets.

## Checks and long-running tool handling

- This handoff: `git fetch origin`; branch comparison 0/0 after owner push; `py -3.14 infra/spec-verify/gen_release_plan.py . --check` fresh; `py -3.14 infra/spec-verify/plan_check.py` 71/0; missing protected R2.1 artifacts confirmed with Test-Path; staged guard required before checkpoint commit.
- PowerShell Python: set `PYTHONUTF8=1`, `PYTHONDONTWRITEBYTECODE=1`; deep add `PYTHONUNBUFFERED=1` and `C:\Program Files\Git\usr\bin` on PATH. Deep command: `uv run --offline --with PyYAML --no-project --python 3.14 infra/spec-verify/verify.py . --deep`.
- Deep verification can take 8–10 minutes while exhaustive UNIQUE proofs copy the repository. Use a temporary hidden PowerShell runner (`Start-Process -WindowStyle Hidden`) with durable log and exit-code files; report PASS only after final output and exit 0. Do not write stale success files into a new run's log names.
- Run PHP test DB suites serially. A tool returning session_id is still running; wait for completion before another DB test. Test DB is edu_saas_test; never migrate the application/demo DB without separate explicit authorization. Frontend commands run in `frontend`, PHP commands in `api`.

Next owner-facing report: protected planning slice, verified command/results, commit SHA/push status, unresolved blockers and next safe work unit. No feature/runtime activation is complete in this handoff.

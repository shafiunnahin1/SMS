# infra/guard - the machine that enforces the agent rules

| File | What |
|---|---|
| `agent_guard.py` | The guard. Checks C1-C14 (see its docstring) on every non-merge commit of a range, or on the staged change. |
| `protected-paths.txt` | Paths the agent may not change without `Change-Request: D<n>`. Read from the PARENT tree, so a commit cannot remove its own protection. |
| `test_guard.py` | Self-test: builds a throw-away git repository and commits one real violation per rule (51 scenarios). `verify.py` runs it. |
| `gen_progress.py` | Writes `docs/PROGRESS.md` (one line per plan task); `--check` that every task has a line. |
| `pre_push_guard.py` | D155 push-state guard. Rejects dirty/untracked/staged work, matching branch stashes, stale/divergent push targets, and never mutates stashes. |
| `install-hooks.sh` | Local commit-msg / pre-push hooks (D155 state check runs before commit-range validation; `--no-verify` skips them). |
| `claude-settings.example.json` | EXAMPLE tool permissions (syntax NOT verified against your tool). |
| `../github-actions-guard.yml` | CI job that runs the BASE-branch copy of the guard on a PR. |
| `../CODEOWNERS.template` | Human approval for the protected paths. |

Rules, reasons and the owner's setup checklist: `docs/ops/agent-guardrails.md`.

Trailers the guard understands: `Task: <id>` · `Change-Request: D<n>` · `Release: R1|R3|FULL`. A justified single-line exception: `guard:allow(<rule>)` (reported as a warning for the reviewer).

HONEST STATUS: tested on synthetic repositories only; never run on real Laravel/React code. The regex rules catch honest mistakes, not determined evasion. Logic errors, subtle spec drift and "tests changed to match wrong code" still need tests and a human reviewer.

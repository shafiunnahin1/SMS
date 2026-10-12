# Agent Continuity Protocol

This file supplements `AGENTS.md`, `CLAUDE.md`, and `docs/ops/agent-guardrails.md`. It does not override them, the locked decisions, the generated task plan, or the guard. When anything conflicts, follow the repository's existing priority rules and stop to report the conflict.

## One Shared Source Of Truth

- Work from the local checkout on the existing branch `claude/elegant-cori-gw2mw5`. Do not create another branch unless the owner asks.
- Only one agent works on this branch at a time. Before handing work to another agent, finish or checkpoint the current task, then push and confirm the remote commit. The next agent pulls that exact branch before editing.
- `docs/AGENT-PLAN-R1.md` and its generated JSON define task scope/order; `docs/LOCKED-DECISIONS.md` defines owner decisions; `docs/PROGRESS.md` records completed tasks and test evidence; `docs/BLOCKED.md` records stop conditions; this file defines handoff notes.
- Never infer completion from a commit title. Check the code, tests, task Done When, and progress evidence.

## Start Every Session

1. Read `AGENT-CONTINUITY.md`, `AGENT-HANDOFF.md`, `AGENTS.md`, `CLAUDE.md` when using Claude, and `docs/ops/agent-guardrails.md`.
2. Read `docs/LOCKED-DECISIONS.md`, the current task in `docs/AGENT-PLAN-R1.md`, `docs/PROGRESS.md`, and relevant entries in `docs/BLOCKED.md`.
3. In `E:\Projects\School Management`, run `git status --short --branch`, `git fetch origin`, `git status --short --branch`, `git log -5 --oneline --decorate`, and compare `HEAD` with `origin/claude/elegant-cori-gw2mw5`.
4. Preserve every pre-existing user change. In particular, `text.txt` is intentionally untracked: do not edit, stage, delete, or commit it.
5. If the branch is behind, pull only after confirming there are no conflicting local changes. If it has diverged, stop and report the exact commits; do not reset, rebase, force-push, or discard work.
6. Identify one next task that is allowed by the plan and its dependencies. If plan order, progress, history, or code disagree, do not guess: record the evidence in `AGENT-HANDOFF.md` and ask the owner.

## Work And Checkpoint Rules

- Do one planned task at a time, in plan order. Keep each change focused on that task; do not bundle unrelated cleanup.
- Before editing, state the task, hypothesis, smallest intended change, and check that can disconfirm it.
- After each meaningful unit of work, update the Current Handoff and append one dated entry to the Event Log in `AGENT-HANDOFF.md`: what changed or was inspected, paths touched, exact command and result, unresolved items, and next action. Do not claim a check ran unless it did.
- Before ending or switching agents, make the handoff sufficient for another agent to resume without reconstructing chat history. Include uncommitted paths and whether a checkpoint is safe. Never claim an unfinished task is complete.
- Follow `AGENTS.md` for tests, task trailers, `docs/PROGRESS.md`, and the staged guard. Before a commit run `python3 infra/guard/agent_guard.py --staged`; commit only the current task and its required progress/handoff evidence.
- Push only to `origin/claude/elegant-cori-gw2mw5`, and only after the commit is verified and the remote has not advanced. If GitHub authentication fails, report it; never paste credentials into chat or files.
- After push, verify `git status --short --branch` and that local `HEAD` equals `origin/claude/elegant-cori-gw2mw5`. Tell the owner the commit, tests, and whether the next agent can pull.

## User-Facing Updates

Use Bengali unless the owner asks otherwise. Give a short update before inspection, before edits, after each meaningful work unit, and at completion. Updates must identify the task, concrete progress, checks/results, blockers, and next step. Avoid vague claims such as “done” or “working as expected.”

## Task Completion

A task can be marked `[x]` in `docs/PROGRESS.md` only after every Done When item and every required verification command in its generated plan has actually passed. Record the commit and concise command results in the same progress line. If a required check is unavailable or fails, leave it incomplete and follow G12 in `docs/ops/agent-guardrails.md`.

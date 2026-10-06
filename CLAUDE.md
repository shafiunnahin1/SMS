# CLAUDE.md

@AGENTS.md
@docs/ops/agent-guardrails.md

(Claude Code reads this file; `AGENTS.md` is the cross-tool rule file, so it is imported rather than duplicated. If your tool does not support `@file` imports, read both files first.)

Before every commit: `python3 infra/guard/agent_guard.py --staged`. One task per commit, with a `Task: <id>` trailer; update `docs/PROGRESS.md` in the same commit.

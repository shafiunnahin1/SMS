# Owner-run only: the agent must not execute this script. Adds the follow-up task ST.3.1 (D165 (2), D66; owner approved in chat
# 2026-10-28): writers' shares of whole class / subject / chapter pack sales, split by each writer's published questions in the
# pack at the time of sale, like a quiz package - one new migration on qb_writer_earnings (its source / item_type values).
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'The guard has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
if ($g.Contains("'ST.3.1'")) { throw 'ST.3.1 is already in the guard.' }

# 1. the task, after ST.3
$t = "'ST.6': ('D165', ['ST.5'])"
if (-not $g.Contains($t)) { throw 'Guard validation failed (task map).' }
$g = $g.Replace($t, "'ST.6': ('D165', ['ST.5']), 'ST.3.1': ('D165', ['ST.3'])")

# 2. its table
$t = "'ST.6': {'ai_answer_reveals': 'D165', 'ai_conversations': 'D165'}"
if (-not $g.Contains($t)) { throw 'Guard validation failed (table map).' }
$g = $g.Replace($t, "'ST.6': {'ai_answer_reveals': 'D165', 'ai_conversations': 'D165'}, 'ST.3.1': {'qb_writer_earnings': 'D165'}")

# 3. its commit carries Change-Request: D165
$t = "R21_REQUIRED_TRAILERS = {"
if (-not $g.Contains($t)) { throw 'Guard validation failed (trailers).' }
$g = $g.Replace($t, "R21_REQUIRED_TRAILERS = {'ST.3.1': ['D165'], ")
[IO.File]::WriteAllText($guard, $g, $utf8)

python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }

git add -- infra/guard/agent_guard.py
git diff --cached --stat
git commit -m "guard: D165 follow-up task ST.3.1 (writers' shares of pack sales)" -m "Change-Request: D165"
if ($LASTEXITCODE -ne 0) { throw 'Commit did not complete; inspect git status.' }
git pull --no-rebase origin claude/r216-omr-d127
git push origin claude/r216-omr-d127

# Owner-run only: the agent must not execute this script. Adds D166's tasks AI-Q1 - AI-Q6 and their tables to the guard.
# Works before or after owner\guard-D165-pack-shares.ps1 (both insert right after the ST.6 entries).
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'The guard has local changes; review them first.' }
$decisions = [IO.File]::ReadAllText((Join-Path $repo 'docs\LOCKED-DECISIONS.md'))
if ($decisions -notmatch '(?m)^\| D166 \|') { throw 'D166 is not in docs/LOCKED-DECISIONS.md yet.' }
$utf8 = [Text.UTF8Encoding]::new($false)
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
if ($g.Contains("'AI-Q1'")) { throw 'The AI-Q tasks are already in the guard.' }

# 1. the tasks, in order (AI-Q1 after AI-P1.6.1, each after the one before)
$t = "'ST.6': ('D165', ['ST.5'])"
if (-not $g.Contains($t)) { throw 'Guard validation failed (task map).' }
$g = $g.Replace($t, "'ST.6': ('D165', ['ST.5']), 'AI-Q1': ('D166', ['AI-P1.6.1']), 'AI-Q2': ('D166', ['AI-Q1']), 'AI-Q3': ('D166', ['AI-Q2']), 'AI-Q4': ('D166', ['AI-Q3']), 'AI-Q5': ('D166', ['AI-Q4']), 'AI-Q6': ('D166', ['AI-Q5'])")

# 2. the tables: approved help articles (AI-Q4), image attachments for OCR, deleted after one day (AI-Q5)
$t = "'ST.6': {'ai_answer_reveals': 'D165', 'ai_conversations': 'D165'}"
if (-not $g.Contains($t)) { throw 'Guard validation failed (table map).' }
$g = $g.Replace($t, "'ST.6': {'ai_answer_reveals': 'D165', 'ai_conversations': 'D165'}, 'AI-Q4': {'ai_help_articles': 'D166'}, 'AI-Q5': {'ai_attachments': 'D166'}")

# 3. every AI-Q commit carries Change-Request: D166
$t = "R21_REQUIRED_TRAILERS = {"
if (-not $g.Contains($t)) { throw 'Guard validation failed (trailers).' }
$g = $g.Replace($t, "R21_REQUIRED_TRAILERS = {'AI-Q1': ['D166'], 'AI-Q2': ['D166'], 'AI-Q3': ['D166'], 'AI-Q4': ['D166'], 'AI-Q5': ['D166'], 'AI-Q6': ['D166'], ")
[IO.File]::WriteAllText($guard, $g, $utf8)

python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }

git add -- infra/guard/agent_guard.py
git diff --cached --stat
git commit -m "guard: D166 tasks AI-Q1 - AI-Q6 and their tables" -m "Change-Request: D166"
if ($LASTEXITCODE -ne 0) { throw 'Commit did not complete; inspect git status.' }
git pull --no-rebase origin claude/r216-omr-d127
git push origin claude/r216-omr-d127

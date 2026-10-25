# Owner-run only: the agent must not execute this script. Adds the follow-up task AI-P1.6.1 (D164 (6)): one new migration on
# ai_messages so that the template answer is kept as history when the small model rephrases it.
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
if ($g.Contains("'AI-P1.6.1'")) { throw 'AI-P1.6.1 is already in the guard.' }

# 1. the task, after AI-P1.6
$t = "'AI-P1.6': ('D164', ['AI-P1.5'])}"
if (-not $g.Contains($t)) { throw 'Guard validation failed (task map).' }
$g = $g.Replace($t, "'AI-P1.6': ('D164', ['AI-P1.5']), 'AI-P1.6.1': ('D164', ['AI-P1.6'])}")

# 2. its table: ai_messages (template_body column)
$t = "'AI-P1.2': {'ai_answer_reveals': 'D164'}}"
if (-not $g.Contains($t)) { throw 'Guard validation failed (table map).' }
$g = $g.Replace($t, "'AI-P1.2': {'ai_answer_reveals': 'D164'}, 'AI-P1.6.1': {'ai_messages': 'D164'}}")

# 3. its commit carries Change-Request: D164
$t = "R21_REQUIRED_TRAILERS = {"
if (-not $g.Contains($t)) { throw 'Guard validation failed (trailers).' }
$g = $g.Replace($t, "R21_REQUIRED_TRAILERS = {'AI-P1.6.1': ['D164'], ")
[IO.File]::WriteAllText($guard, $g, $utf8)

python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }

git add -- infra/guard/agent_guard.py
git diff --cached --stat
git commit -m "guard: D164 follow-up task AI-P1.6.1 (template answer history)" -m "Change-Request: D164"
if ($LASTEXITCODE -ne 0) { throw 'Commit did not complete; inspect git status.' }
git pull --no-rebase origin claude/r216-omr-d127
git push origin claude/r216-omr-d127

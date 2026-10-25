# Owner-run only: the agent must not execute this script. Adds D165's tasks ST.1 - ST.6 and their tables to the guard.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'The guard has local changes; review them first.' }
$decisions = [IO.File]::ReadAllText((Join-Path $repo 'docs\LOCKED-DECISIONS.md'))
if ($decisions -notmatch '(?m)^\| D165 \|') { throw 'D165 is not in docs/LOCKED-DECISIONS.md yet.' }
$utf8 = [Text.UTF8Encoding]::new($false)
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
if ($g.Contains("'ST.1'")) { throw 'The ST tasks are already in the guard.' }

# 1. the tasks, in order (ST.1 after AI-P1.6.1, each after the one before)
$t = "'AI-P1.6.1': ('D164', ['AI-P1.6'])}"
if (-not $g.Contains($t)) { throw 'Guard validation failed (task map).' }
$g = $g.Replace($t, "'AI-P1.6.1': ('D164', ['AI-P1.6']), 'ST.1': ('D165', ['AI-P1.6.1']), 'ST.2': ('D165', ['ST.1']), 'ST.3': ('D165', ['ST.2']), 'ST.4': ('D165', ['ST.3']), 'ST.5': ('D165', ['ST.4']), 'ST.6': ('D165', ['ST.5'])}")

# 2. the tables each task may migrate:
#    ST.1 the `learners` institution type and the learner profile (class); ST.2 exam batches, the batch on the profile, expiry on single-item unlocks;
#    ST.3 class/subject/chapter access, their student prices, the order's items; ST.4 practice attempts; ST.6 per-student free answers for the AI
$t = "'AI-P1.6.1': {'ai_messages': 'D164'}}"
if (-not $g.Contains($t)) { throw 'Guard validation failed (table map).' }
$g = $g.Replace($t, "'AI-P1.6.1': {'ai_messages': 'D164'}, 'ST.1': {'institutions': 'D165', 'learner_profiles': 'D165'}, 'ST.2': {'qb_exam_batches': 'D165', 'learner_profiles': 'D165', 'qb_student_unlocks': 'D165'}, 'ST.3': {'qb_student_scope_access': 'D165', 'qb_prices': 'D165', 'qb_student_orders': 'D165'}, 'ST.4': {'qb_practice_attempts': 'D165'}, 'ST.6': {'ai_answer_reveals': 'D165', 'ai_conversations': 'D165'}}")

# 3. every ST commit carries Change-Request: D165
$t = "R21_REQUIRED_TRAILERS = {"
if (-not $g.Contains($t)) { throw 'Guard validation failed (trailers).' }
$g = $g.Replace($t, "R21_REQUIRED_TRAILERS = {'ST.1': ['D165'], 'ST.2': ['D165'], 'ST.3': ['D165'], 'ST.4': ['D165'], 'ST.5': ['D165'], 'ST.6': ['D165'], ")
[IO.File]::WriteAllText($guard, $g, $utf8)

python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }

git add -- infra/guard/agent_guard.py
git diff --cached --stat
git commit -m "guard: D165 tasks ST.1 - ST.6 and their tables" -m "Change-Request: D165"
if ($LASTEXITCODE -ne 0) { throw 'Commit did not complete; inspect git status.' }
git pull --no-rebase origin claude/r216-omr-d127
git push origin claude/r216-omr-d127

# Owner-run only: the agent must not execute this script. Adds D164's tasks AI-P1.1 - AI-P1.6 and their tables to the guard.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'The guard has local changes; review them first.' }
$decisions = [IO.File]::ReadAllText((Join-Path $repo 'docs\LOCKED-DECISIONS.md'))
if ($decisions -notmatch '(?m)^\| D164 \|') { throw 'D164 is not in docs/LOCKED-DECISIONS.md yet.' }
$utf8 = [Text.UTF8Encoding]::new($false)
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
if ($g.Contains("'AI-P1.1'")) { throw 'The AI-P1 tasks are already in the guard.' }

# 1. the tasks, in order (AI-P1.1 after R2.1.7, each after the one before)
$t = "'R2.1.7': ('D158', ['R2.1.6'])}"
if (-not $g.Contains($t)) { throw 'Guard validation failed (task map).' }
$g = $g.Replace($t, "'R2.1.7': ('D158', ['R2.1.6']), 'AI-P1.1': ('D164', ['R2.1.7']), 'AI-P1.2': ('D164', ['AI-P1.1']), 'AI-P1.3': ('D164', ['AI-P1.2']), 'AI-P1.4': ('D164', ['AI-P1.3']), 'AI-P1.5': ('D164', ['AI-P1.4']), 'AI-P1.6': ('D164', ['AI-P1.5'])}")

# 2. the tables: new AI tables and FULLTEXT indexes on the question-bank / curriculum text (AI-P1.1), the reveal log for the daily free quota (AI-P1.2)
$t = "'R2.1.7': {'exam_papers': 'D158', 'exam_result_sms': 'D161', 'exam_mark_submissions': 'D162'}}"
if (-not $g.Contains($t)) { throw 'Guard validation failed (table map).' }
$g = $g.Replace($t, "'R2.1.7': {'exam_papers': 'D158', 'exam_result_sms': 'D161', 'exam_mark_submissions': 'D162'}, 'AI-P1.1': {'ai_conversations': 'D164', 'ai_messages': 'D164', 'ai_reviews': 'D164', 'ai_answer_bank': 'D164', 'qb_questions': 'D164', 'qb_question_options': 'D164', 'qb_creative_parts': 'D164', 'qb_curriculum_nodes': 'D164'}, 'AI-P1.2': {'ai_answer_reveals': 'D164'}}")

# 3. every AI-P1 commit carries Change-Request: D164
$t = "R21_REQUIRED_TRAILERS = {"
if (-not $g.Contains($t)) { throw 'Guard validation failed (trailers).' }
$g = $g.Replace($t, "R21_REQUIRED_TRAILERS = {'AI-P1.1': ['D164'], 'AI-P1.2': ['D164'], 'AI-P1.3': ['D164'], 'AI-P1.4': ['D164'], 'AI-P1.5': ['D164'], 'AI-P1.6': ['D164'], ")
[IO.File]::WriteAllText($guard, $g, $utf8)

python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }

git add -- infra/guard/agent_guard.py
git diff --cached --stat
git commit -m "guard: D164 tasks AI-P1.1 - AI-P1.6 and their tables" -m "Change-Request: D164"
if ($LASTEXITCODE -ne 0) { throw 'Commit did not complete; inspect git status.' }
git pull --no-rebase origin claude/r216-omr-d127
git push origin claude/r216-omr-d127

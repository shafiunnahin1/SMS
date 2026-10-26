# Owner-run only: the agent must not execute this script.
# D169: (1) the decision row, (2) tasks STW.1 - STW.5 in the guard (after AI-Q4; the AI-Q4S articles and AI-Q5 wait for STW.5) and
# the table staff_attendance_grants for STW.5. Two commits; no push.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'Registry or guard has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)

# 1. the decision row, after D168
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D169-staff-work-pages.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D169 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D168 \|' -or $content -match '(?m)^\| D169 \|') { throw 'D169 packet or registry validation failed.' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$content = [regex]::Replace($content, '(?m)^(\| D168 \|[^\r\n]*)', ('$1' + $newline + $rows[0]))
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m "decision: approve D169 staff work pages" -m "Change-Request: D169"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }

# 2. the guard: STW.1 - STW.5 in order after AI-Q4; AI-Q4S (its articles) after STW.5; AI-Q5 still after AI-Q4S
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
if ($g.Contains("'STW.1'")) { throw 'The STW tasks are already in the guard.' }
$t = "'AI-Q4S': ('D168', ['AI-Q4'])"
if (-not $g.Contains($t)) { throw 'Guard validation failed (task map).' }
$g = $g.Replace($t, "'STW.1': ('D169', ['AI-Q4']), 'STW.2': ('D169', ['STW.1']), 'STW.3': ('D169', ['STW.2']), 'STW.4': ('D169', ['STW.3']), 'STW.5': ('D169', ['STW.4']), 'AI-Q4S': ('D168', ['AI-Q4', 'STW.5'])")
$t = "'AI-Q4S': ['D166', 'D168']"
if (-not $g.Contains($t)) { throw 'Guard validation failed (trailers).' }
$g = $g.Replace($t, "'STW.1': ['D169'], 'STW.2': ['D169'], 'STW.3': ['D169'], 'STW.4': ['D169'], 'STW.5': ['D169'], 'AI-Q4S': ['D166', 'D168']")
$t = "'AI-Q5': {'ai_attachments': 'D166'}"
if (-not $g.Contains($t)) { throw 'Guard validation failed (table map).' }
$g = $g.Replace($t, "'STW.5': {'staff_attendance_grants': 'D169'}, 'AI-Q5': {'ai_attachments': 'D166'}")
[IO.File]::WriteAllText($guard, $g, $utf8)
python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }
git add -- infra/guard/agent_guard.py
git commit -m "guard: D169 tasks STW.1 - STW.5 and staff_attendance_grants" -m "Change-Request: D169"
if ($LASTEXITCODE -ne 0) { throw 'Guard commit did not complete; inspect git status.' }

# 3. no push here. Run infra/guard/pre_push_guard.py by hand first (as for D167/D168), then git push - never --no-verify.
Write-Host 'D169 committed locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

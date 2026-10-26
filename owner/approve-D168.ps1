# Owner-run only: the agent must not execute this script.
# D168: (1) the decision row, (2) task AI-Q4S in the guard (after AI-Q4; AI-Q5 now follows AI-Q4S). Two commits; no push.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'Registry or guard has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)

# 1. the decision row, after D167
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D168-staff-help-scope.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D168 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D167 \|' -or $content -match '(?m)^\| D168 \|') { throw 'D168 packet or registry validation failed.' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$content = [regex]::Replace($content, '(?m)^(\| D167 \|[^\r\n]*)', ('$1' + $newline + $rows[0]))
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m "decision: approve D168 staff software help by duty permission" -m "Change-Request: D168"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }

# 2. the guard: AI-Q4S after AI-Q4, AI-Q5 after AI-Q4S, trailers D166 + D168
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
if ($g.Contains("'AI-Q4S'")) { throw 'AI-Q4S is already in the guard.' }
$t = "'AI-Q4': ('D166', ['AI-Q3']), 'AI-Q5': ('D166', ['AI-Q4'])"
if (-not $g.Contains($t)) { throw 'Guard validation failed (task map).' }
$g = $g.Replace($t, "'AI-Q4': ('D166', ['AI-Q3']), 'AI-Q4S': ('D168', ['AI-Q4']), 'AI-Q5': ('D166', ['AI-Q4S'])")
$t = "'AI-Q4': ['D166'], 'AI-Q5': ['D166']"
if (-not $g.Contains($t)) { throw 'Guard validation failed (trailers).' }
$g = $g.Replace($t, "'AI-Q4': ['D166'], 'AI-Q4S': ['D166', 'D168'], 'AI-Q5': ['D166']")
[IO.File]::WriteAllText($guard, $g, $utf8)
python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }
git add -- infra/guard/agent_guard.py
git commit -m "guard: D168 task AI-Q4S (staff help) before AI-Q5" -m "Change-Request: D168"
if ($LASTEXITCODE -ne 0) { throw 'Guard commit did not complete; inspect git status.' }

# 3. no push here. Run the pre-push guard by hand first (as for D167), then git push - never --no-verify.
Write-Host 'D168 committed locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

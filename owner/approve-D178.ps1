# Owner-run only: the agent must not execute this script.
# D178: (1) the decision row, (2) task QBG.1 in the guard (after QBS.1), paper settings and set rebuild. Two commits; no push.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'Registry or guard has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)

# 1. the decision row, after D177 (or D176 if D177 is not approved)
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D178-final-paper-grouping.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D178 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D176 \|' -or $content -match '(?m)^\| D178 \|') { throw 'D178 packet or registry validation failed.' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$anchor = if ($content -match '(?m)^\| D177 \|') { 'D177' } else { 'D176' }
$content = [regex]::Replace($content, "(?m)^(\| $anchor \|[^\r\n]*)", ('$1' + $newline + $rows[0]))
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m "decision: approve D178 subject grouping can change on a final paper" -m "Change-Request: D178"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }

# 2. the guard: QBG.1 after QBS.1; trailer D178; no tables
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
if ($g.Contains("'QBG.1'")) { throw 'QBG.1 is already in the guard.' }
$t = "'QBS.1': ('D176', ['QBF.1'])"
if (-not $g.Contains($t)) { throw 'Guard validation failed (task map).' }
$g = $g.Replace($t, "$t, 'QBG.1': ('D178', ['QBS.1'])")
$t = "'QBS.1': ['D176']"
if (-not $g.Contains($t)) { throw 'Guard validation failed (trailers).' }
$g = $g.Replace($t, "$t, 'QBG.1': ['D178']")
[IO.File]::WriteAllText($guard, $g, $utf8)
python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }
git add -- infra/guard/agent_guard.py
git commit -m "guard: D178 task QBG.1" -m "Change-Request: D178"
if ($LASTEXITCODE -ne 0) { throw 'Guard commit did not complete; inspect git status.' }

# 3. no push here. Run infra/guard/pre_push_guard.py (refs on stdin) first, then git push - never --no-verify.
Write-Host 'D178 committed locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

# Owner-run only: the agent must not execute this script.
# D184: (1) the decision row, (2) the guard: QBO.2 depends on QBS.1 instead of QBO.1. Two commits; no push.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'Registry or guard has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)

# 1. the decision row, after the last D18x row present
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D184-qbo2-before-qbo1-acceptance.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D184 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D182 \|' -or $content -match '(?m)^\| D184 \|') { throw 'D184 packet or registry validation failed.' }
$anchor = if ($content -match '(?m)^\| D183 \|') { 'D183' } else { 'D182' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$content = [regex]::Replace($content, "(?m)^(\| $anchor \|[^\r\n]*)", ('$1' + $newline + $rows[0]))
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m "decision: approve D184 QBO.2 before QBO.1 acceptance" -m "Change-Request: D184"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }

# 2. the guard: QBO.2 after QBS.1 (was QBO.1)
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
$t = "'QBO.2': ('D180', ['QBO.1'])"
if (-not $g.Contains($t)) { throw 'Guard validation failed (QBO.2 entry not as expected).' }
$g = $g.Replace($t, "'QBO.2': ('D180', ['QBS.1'])")
[IO.File]::WriteAllText($guard, $g, $utf8)
python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }
git add -- infra/guard/agent_guard.py
git commit -m "guard: D184 QBO.2 depends on QBS.1" -m "Change-Request: D184"
if ($LASTEXITCODE -ne 0) { throw 'Guard commit did not complete; inspect git status.' }

# 3. no push here. Run infra/guard/pre_push_guard.py (refs on stdin) first, then git push - never --no-verify.
Write-Host 'D184 committed locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

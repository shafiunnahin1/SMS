# Owner-run only: the agent must not execute this script.
# D176: (1) the decision row, (2) task QBS.1 in the guard (after QBF.1), screens plus one per_page validation limit. Two commits; no push.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'Registry or guard has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)

# 1. the decision row, after D175
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D176-keep-selection.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D176 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D175 \|' -or $content -match '(?m)^\| D176 \|') { throw 'D176 packet or registry validation failed.' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$anchor = 'D175'
$content = [regex]::Replace($content, "(?m)^(\| $anchor \|[^\r\n]*)", ('$1' + $newline + $rows[0]))
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m "decision: approve D176 selections survive refresh and 25-100 per page on All Questions" -m "Change-Request: D176"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }

# 2. the guard: QBS.1 after QBF.1; trailer D176; no tables
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
if ($g.Contains("'QBS.1'")) { throw 'QBS.1 is already in the guard.' }
$t = "'QBF.1': ('D175', ['SETC.2'])"
if (-not $g.Contains($t)) { throw 'Guard validation failed (task map).' }
$g = $g.Replace($t, "$t, 'QBS.1': ('D176', ['QBF.1'])")
$t = "'QBF.1': ['D175']"
if (-not $g.Contains($t)) { throw 'Guard validation failed (trailers).' }
$g = $g.Replace($t, "$t, 'QBS.1': ['D176']")
[IO.File]::WriteAllText($guard, $g, $utf8)
python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }
git add -- infra/guard/agent_guard.py
git commit -m "guard: D176 task QBS.1" -m "Change-Request: D176"
if ($LASTEXITCODE -ne 0) { throw 'Guard commit did not complete; inspect git status.' }

# 3. no push here. Run infra/guard/pre_push_guard.py (refs on stdin) first, then git push - never --no-verify.
Write-Host 'D176 committed locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

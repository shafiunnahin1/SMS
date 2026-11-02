# Owner-run only: the agent must not execute this script.
# D190: (1) the decision row after D189, (2) task R1-SUP in the guard (after SVR.1), trailer D190. Two commits; no push.
$ErrorActionPreference = 'Stop'
$env:Path = "C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\python;$env:Path"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'Registry or guard has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$content = [IO.File]::ReadAllText($registry)
$g = [IO.File]::ReadAllText($guard)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D190-close-r1-5x.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D190 \|' })
$t1 = "'SVR.1': ('D188', ['SUB.3'])"; $t2 = "'SVR.1': ['D188']"
# validate everything before changing anything
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D189 \|' -or $content -match '(?m)^\| D190 \|') { throw 'D190 packet or registry validation failed.' }
if ($g.Contains("'R1-SUP'") -or -not $g.Contains($t1) -or -not $g.Contains($t2)) { throw 'Guard validation failed.' }

# 1. the decision row
$nl = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$content = [regex]::Replace($content, "(?m)^(\| D189 \|[^\r\n]*)", ('$1' + $nl + $rows[0].Replace('$', '$$')))
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m "decision: approve D190 close R1 5.1 and 5.2 as superseded" -m "Change-Request: D190"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }

# 2. the guard: R1-SUP after SVR.1; trailer D190
$g = $g.Replace($t1, "$t1, 'R1-SUP': ('D190', ['SVR.1'])").Replace($t2, "$t2, 'R1-SUP': ['D190']")
[IO.File]::WriteAllText($guard, $g, $utf8)
python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }
git add -- infra/guard/agent_guard.py
git commit -m "guard: D190 task R1-SUP" -m "Change-Request: D190"
if ($LASTEXITCODE -ne 0) { throw 'Guard commit did not complete; inspect git status.' }
Write-Host 'D190 committed locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

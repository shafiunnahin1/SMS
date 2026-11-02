# Owner-run only: the agent must not execute this script.
# D191: (1) the decision row after D190, (2) R2.1.8 approved in the guard (after R2.1.7), trailer D191. Two commits; no push.
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
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D191-r218-no-legacy.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D191 \|' })
$t1 = "'R1-SUP': ('D190', ['SVR.1'])"; $t2 = "'R1-SUP': ['D190']"
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D190 \|' -or $content -match '(?m)^\| D191 \|') { throw 'D191 packet or registry validation failed.' }
if ($g.Contains("'R2.1.8': (") -or -not $g.Contains($t1) -or -not $g.Contains($t2)) { throw 'Guard validation failed.' }

$nl = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$content = [regex]::Replace($content, "(?m)^(\| D190 \|[^\r\n]*)", ('$1' + $nl + $rows[0].Replace('$', '$$')))
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m "decision: approve D191 R2.1.8 without legacy rights" -m "Change-Request: D191"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }

$g = $g.Replace($t1, "$t1, 'R2.1.8': ('D191', ['R2.1.7'])").Replace($t2, "$t2, 'R2.1.8': ['D191']")
[IO.File]::WriteAllText($guard, $g, $utf8)
python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }
git add -- infra/guard/agent_guard.py
git commit -m "guard: D191 approves R2.1.8" -m "Change-Request: D191"
if ($LASTEXITCODE -ne 0) { throw 'Guard commit did not complete; inspect git status.' }
Write-Host 'D191 committed locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

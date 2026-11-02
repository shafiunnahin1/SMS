# Owner-run only: the agent must not execute this script.
# D192: (1) the decision row after D191, (2) R2.1.9 approved in the guard (after R2.1.8), trailer D192. Two commits; no push.
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
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D192-r219-acceptance.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D192 \|' })
$t1 = "'R2.1.8': ('D191', ['R2.1.7'])"; $t2 = "'R2.1.8': ['D191']"
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D191 \|' -or $content -match '(?m)^\| D192 \|') { throw 'D192 packet or registry validation failed.' }
if ($g.Contains("'R2.1.9': (") -or -not $g.Contains($t1) -or -not $g.Contains($t2)) { throw 'Guard validation failed.' }

$nl = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$content = [regex]::Replace($content, "(?m)^(\| D191 \|[^\r\n]*)", ('$1' + $nl + $rows[0].Replace('$', '$$')))
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m "decision: approve D192 R2.1.9 acceptance inside runtime R3" -m "Change-Request: D192"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }

$g = $g.Replace($t1, "$t1, 'R2.1.9': ('D192', ['R2.1.8'])").Replace($t2, "$t2, 'R2.1.9': ['D192']")
[IO.File]::WriteAllText($guard, $g, $utf8)
python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }
git add -- infra/guard/agent_guard.py
git commit -m "guard: D192 approves R2.1.9" -m "Change-Request: D192"
if ($LASTEXITCODE -ne 0) { throw 'Guard commit did not complete; inspect git status.' }
Write-Host 'D192 committed locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

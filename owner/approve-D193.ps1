# Owner-run only: the agent must not execute this script.
# D193: (1) the decision row after D192, (2) tasks NTC.1 -> ADM.1 -> RTN.1 -> SUP.1 -> MIG.1 -> EXP.1 in the guard (after R2.1.9), trailer D193, their tables. Two commits; no push.
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
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D193-r11-features.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D193 \|' })
$t1 = "'R2.1.9': ('D192', ['R2.1.8'])"; $t2 = "'R2.1.9': ['D192']"
$t3 = "'SUB.2': {'coupons': 'D187', 'coupon_redemptions': 'D187'}"
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D192 \|' -or $content -match '(?m)^\| D193 \|') { throw 'D193 packet or registry validation failed.' }
if ($g.Contains("'NTC.1'") -or -not $g.Contains($t1) -or -not $g.Contains($t2) -or -not $g.Contains($t3)) { throw 'Guard validation failed.' }

$nl = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$content = [regex]::Replace($content, "(?m)^(\| D192 \|[^\r\n]*)", ('$1' + $nl + $rows[0].Replace('$', '$$')))
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m "decision: approve D193 R1.1 remaining features in order" -m "Change-Request: D193"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }

$tasks = "'NTC.1': ('D193', ['R2.1.9']), 'ADM.1': ('D193', ['NTC.1']), 'RTN.1': ('D193', ['ADM.1']), 'SUP.1': ('D193', ['RTN.1']), 'MIG.1': ('D193', ['SUP.1']), 'EXP.1': ('D193', ['MIG.1'])"
$trail = "'NTC.1': ['D193'], 'ADM.1': ['D193'], 'RTN.1': ['D193'], 'SUP.1': ['D193'], 'MIG.1': ['D193'], 'EXP.1': ['D193']"
$tables = "'NTC.1': {'notices': 'D193', 'notice_receipts': 'D193'}, 'ADM.1': {'exams': 'D193'}, 'RTN.1': {'routines': 'D193'}, 'SUP.1': {'support_tickets': 'D193', 'support_ticket_messages': 'D193'}, 'MIG.1': {'import_jobs': 'D193', 'import_rows': 'D193'}, 'EXP.1': {'tenant_exports': 'D193'}"
$g = $g.Replace($t1, "$t1, $tasks").Replace($t2, "$t2, $trail").Replace($t3, "$t3, $tables")
[IO.File]::WriteAllText($guard, $g, $utf8)
python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }
git add -- infra/guard/agent_guard.py
git commit -m "guard: D193 tasks NTC.1-EXP.1" -m "Change-Request: D193"
if ($LASTEXITCODE -ne 0) { throw 'Guard commit did not complete; inspect git status.' }
Write-Host 'D193 committed locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

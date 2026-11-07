# Owner-run only: the agent must not execute this script.
# D193 guard follow-up: the D193 guard commit admitted the tasks' tables but not their R1.1 controllers, so guard C4 refuses
# NTC.1's NoticeController route. This adds the R1.1 controllers each D193 task may name (from docs/release/r1-scope.json):
# NTC.1 NoticeController / NoticeAckController, RTN.1 RoutineController, SUP.1 SupportTicketController / SuperSupportController,
# EXP.1 ExportController / SuperBackupController / SuperImportController. One commit; no push.
$ErrorActionPreference = 'Stop'
$env:Path = "C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\python;$env:Path"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'Guard has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
$old = "R21_CONTROLLERS = {'SUB.2': {'CouponController': 'D187'}}"
if (-not $g.Contains($old) -or $g.Contains("'NoticeController': 'D193'")) { throw 'Guard validation failed.' }
$new = "R21_CONTROLLERS = {'SUB.2': {'CouponController': 'D187'}, 'NTC.1': {'NoticeController': 'D193', 'NoticeAckController': 'D193'}, 'RTN.1': {'RoutineController': 'D193'}, 'SUP.1': {'SupportTicketController': 'D193', 'SuperSupportController': 'D193'}, 'EXP.1': {'ExportController': 'D193', 'SuperBackupController': 'D193', 'SuperImportController': 'D193'}}"
$g = $g.Replace($old, $new)
[IO.File]::WriteAllText($guard, $g, $utf8)
python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }
git add -- infra/guard/agent_guard.py
git commit -m "guard: D193 task controllers (C4)" -m "Change-Request: D193"
if ($LASTEXITCODE -ne 0) { throw 'Guard commit did not complete; inspect git status.' }
Write-Host 'D193 controllers committed locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

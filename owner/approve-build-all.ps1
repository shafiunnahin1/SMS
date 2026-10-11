# Owner-only helper (2026-10-11): records decision D64 (build everything; only the server deploy later) as ONE human commit with
# `Change-Request: D64` (docs/ops/agent-guardrails.md section 4). After it is pushed, the agent updates the plan, builds 9.1 locally, does task A and starts Release 3
# in its own commits with the same trailer. Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File owner\approve-build-all.ps1
# Read owner\decision-D64.md first - committing the row is your approval.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Invoke-Git { & git.exe @args; if ($LASTEXITCODE -ne 0) { throw "git $args failed (exit $LASTEXITCODE) - nothing after this step was done" } }
if (-not (git config user.email)) { throw 'git has no user.name / user.email: run  git config --global user.name "Your Name"  and  git config --global user.email "you@example.com"  first' }
Invoke-Git pull
$utf8 = New-Object System.Text.UTF8Encoding $false
$dec  = Join-Path (Get-Location) 'docs\LOCKED-DECISIONS.md'
$lines = [Collections.Generic.List[string]]([IO.File]::ReadAllLines($dec, $utf8))
if ($lines | Where-Object { $_ -like '| D64 |*' }) { throw 'D64 is already in docs/LOCKED-DECISIONS.md - nothing to do' }
$at = -1; for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -like '| D63 |*') { $at = $i } }
if ($at -lt 0) { throw 'row D63 not found in docs/LOCKED-DECISIONS.md' }
$lines.InsertRange($at + 1, [IO.File]::ReadAllLines((Join-Path (Get-Location) 'owner\decision-D64.md'), $utf8))
[IO.File]::WriteAllText($dec, (($lines -join "`n") + "`n"), $utf8)
Invoke-Git add docs/LOCKED-DECISIONS.md
Invoke-Git commit docs/LOCKED-DECISIONS.md -m "decision D64: build everything locally, only the server deploy later" -m "Change-Request: D64"
Invoke-Git push
Write-Host 'Done: D64 recorded. Tell the agent to continue.'

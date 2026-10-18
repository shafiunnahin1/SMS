# Owner-only helper (2026-10-11): records decision D68 (student login with the question bank, and three small approvals) as ONE human commit with
# `Change-Request: D68` (docs/ops/agent-guardrails.md section 4). After it is pushed, the agent turns on student login (QB.9) and does the three approved changes
# in its own commits with the same trailer. Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File owner\approve-d68.ps1
# Read owner\decision-D68.md first - committing the row is your approval.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Invoke-Git { & git.exe @args; if ($LASTEXITCODE -ne 0) { throw "git $args failed (exit $LASTEXITCODE) - nothing after this step was done" } }
if (-not (git config user.email)) { throw 'git has no user.name / user.email: run  git config --global user.name "Your Name"  and  git config --global user.email "you@example.com"  first' }
Invoke-Git pull
$utf8 = New-Object System.Text.UTF8Encoding $false
$dec  = Join-Path (Get-Location) 'docs\LOCKED-DECISIONS.md'
$lines = [Collections.Generic.List[string]]([IO.File]::ReadAllLines($dec, $utf8))
if ($lines | Where-Object { $_ -like '| D68 |*' }) { throw 'D68 is already in docs/LOCKED-DECISIONS.md - nothing to do' }
$at = -1; for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -like '| D67 |*') { $at = $i } }
if ($at -lt 0) { throw 'row D67 not found in docs/LOCKED-DECISIONS.md' }
$lines.InsertRange($at + 1, [IO.File]::ReadAllLines((Join-Path (Get-Location) 'owner\decision-D68.md'), $utf8))
[IO.File]::WriteAllText($dec, (($lines -join "`n") + "`n"), $utf8)
Invoke-Git add docs/LOCKED-DECISIONS.md
Invoke-Git commit docs/LOCKED-DECISIONS.md -m "decision D68: student login with the question bank, poppler, CI workers, OTP throttle" -m "Change-Request: D68"
Invoke-Git push
Write-Host 'Done: D68 recorded. Tell the agent to continue.'

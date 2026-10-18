# Owner-only helper (2026-10-10): records decisions D55-D60 (subscription later, SMS wallet in taka at 0.40 per part, universal
# BulkSMSBD API, online recharge, the institution's own API with on/off toggles, build order) as ONE human commit with
# `Change-Request: D55,D56,D57,D58,D59,D60` (docs/ops/agent-guardrails.md section 4). Read owner\decisions-D55-D60.md first -
# committing the rows is your approval. Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File owner\approve-sms-and-order.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Invoke-Git { & git.exe @args; if ($LASTEXITCODE -ne 0) { throw "git $args failed (exit $LASTEXITCODE) - nothing after this step was done" } }
if (-not (git config user.email)) { throw 'git has no user.name / user.email: run  git config --global user.name "Your Name"  and  git config --global user.email "you@example.com"  first' }
Invoke-Git pull
$utf8 = New-Object System.Text.UTF8Encoding $false
$dec  = Join-Path (Get-Location) 'docs\LOCKED-DECISIONS.md'
$lines = [Collections.Generic.List[string]]([IO.File]::ReadAllLines($dec, $utf8))
if ($lines | Where-Object { $_ -like '| D55 |*' }) { throw 'D55 is already in docs/LOCKED-DECISIONS.md - nothing to do' }
$at = -1; for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -like '| D54 |*') { $at = $i } }
if ($at -lt 0) { throw 'row D54 not found in docs/LOCKED-DECISIONS.md' }
$lines.InsertRange($at + 1, [IO.File]::ReadAllLines((Join-Path (Get-Location) 'owner\decisions-D55-D60.md'), $utf8))
[IO.File]::WriteAllText($dec, (($lines -join "`n") + "`n"), $utf8)
Invoke-Git add docs/LOCKED-DECISIONS.md
Invoke-Git commit docs/LOCKED-DECISIONS.md -m "decisions D55-D60: SMS wallet, universal and own SMS API, recharge, subscription later, build order" -m "Change-Request: D55,D56,D57,D58,D59,D60"
Invoke-Git push
Write-Host 'Done: D55-D60 recorded. Tell the agent to continue.'

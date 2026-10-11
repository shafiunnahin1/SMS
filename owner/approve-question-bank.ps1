# Owner-only helper (2026-10-11): records decision D65 (question bank merged into the platform) as ONE human commit with
# `Change-Request: D65` (docs/ops/agent-guardrails.md section 4). After it is pushed, the agent writes the question-bank module spec and plan for your review
# in its own commits with the same trailer. Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File owner\approve-question-bank.ps1
# Read owner\decision-D65.md first - committing the row is your approval.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Invoke-Git { & git.exe @args; if ($LASTEXITCODE -ne 0) { throw "git $args failed (exit $LASTEXITCODE) - nothing after this step was done" } }
if (-not (git config user.email)) { throw 'git has no user.name / user.email: run  git config --global user.name "Your Name"  and  git config --global user.email "you@example.com"  first' }
Invoke-Git pull
$utf8 = New-Object System.Text.UTF8Encoding $false
$dec  = Join-Path (Get-Location) 'docs\LOCKED-DECISIONS.md'
$lines = [Collections.Generic.List[string]]([IO.File]::ReadAllLines($dec, $utf8))
if ($lines | Where-Object { $_ -like '| D65 |*' }) { throw 'D65 is already in docs/LOCKED-DECISIONS.md - nothing to do' }
$at = -1; for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -like '| D64 |*') { $at = $i } }
if ($at -lt 0) { throw 'row D64 not found in docs/LOCKED-DECISIONS.md' }
$lines.InsertRange($at + 1, [IO.File]::ReadAllLines((Join-Path (Get-Location) 'owner\decision-D65.md'), $utf8))
[IO.File]::WriteAllText($dec, (($lines -join "`n") + "`n"), $utf8)
Invoke-Git add docs/LOCKED-DECISIONS.md
Invoke-Git commit docs/LOCKED-DECISIONS.md -m "decision D65: question bank merged into the platform" -m "Change-Request: D65"
Invoke-Git push
Write-Host 'Done: D65 recorded. Tell the agent to continue.'

# Owner-only helper (2026-10-11): records decision D62 (load-test limits for Step 8.5) as ONE human commit with
# `Change-Request: D62` (docs/ops/agent-guardrails.md section 4). After it is pushed, the agent fixes the k6 script and writes the measured numbers
# in its own Step 8.5 commit with the same trailer. Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File owner\approve-loadtest.ps1
# Read owner\decision-D62.md first - committing the row is your approval.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Invoke-Git { & git.exe @args; if ($LASTEXITCODE -ne 0) { throw "git $args failed (exit $LASTEXITCODE) - nothing after this step was done" } }
if (-not (git config user.email)) { throw 'git has no user.name / user.email: run  git config --global user.name "Your Name"  and  git config --global user.email "you@example.com"  first' }
Invoke-Git pull
$utf8 = New-Object System.Text.UTF8Encoding $false
$dec  = Join-Path (Get-Location) 'docs\LOCKED-DECISIONS.md'
$lines = [Collections.Generic.List[string]]([IO.File]::ReadAllLines($dec, $utf8))
if ($lines | Where-Object { $_ -like '| D62 |*' }) { throw 'D62 is already in docs/LOCKED-DECISIONS.md - nothing to do' }
$at = -1; for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -like '| D61 |*') { $at = $i } }
if ($at -lt 0) { throw 'row D61 not found in docs/LOCKED-DECISIONS.md' }
$lines.InsertRange($at + 1, [IO.File]::ReadAllLines((Join-Path (Get-Location) 'owner\decision-D62.md'), $utf8))
[IO.File]::WriteAllText($dec, (($lines -join "`n") + "`n"), $utf8)
Invoke-Git add docs/LOCKED-DECISIONS.md
Invoke-Git commit docs/LOCKED-DECISIONS.md -m "decision D62: load-test p95 limits (Step 8.5)" -m "Change-Request: D62"
Invoke-Git push
Write-Host 'Done: D62 recorded. Tell the agent to continue (8.5).'

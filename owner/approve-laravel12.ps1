# Owner-only helper (2026-10-10): records decision D61 (Laravel 12 for Step 8.2) as ONE human commit with
# `Change-Request: D61` (docs/ops/agent-guardrails.md section 4). After it is pushed, the agent commits the Laravel 12 upgrade (composer.json + composer.lock)
# in its own Step 8.2 commit with the same trailer. Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File owner\approve-laravel12.ps1
# Read owner\decision-D61.md first - committing the row is your approval.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Invoke-Git { & git.exe @args; if ($LASTEXITCODE -ne 0) { throw "git $args failed (exit $LASTEXITCODE) - nothing after this step was done" } }
if (-not (git config user.email)) { throw 'git has no user.name / user.email: run  git config --global user.name "Your Name"  and  git config --global user.email "you@example.com"  first' }
Invoke-Git pull
$utf8 = New-Object System.Text.UTF8Encoding $false
$dec  = Join-Path (Get-Location) 'docs\LOCKED-DECISIONS.md'
$lines = [Collections.Generic.List[string]]([IO.File]::ReadAllLines($dec, $utf8))
if ($lines | Where-Object { $_ -like '| D61 |*' }) { throw 'D61 is already in docs/LOCKED-DECISIONS.md - nothing to do' }
$at = -1; for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -like '| D60 |*') { $at = $i } }
if ($at -lt 0) { throw 'row D60 not found in docs/LOCKED-DECISIONS.md' }
$lines.InsertRange($at + 1, [IO.File]::ReadAllLines((Join-Path (Get-Location) 'owner\decision-D61.md'), $utf8))
[IO.File]::WriteAllText($dec, (($lines -join "`n") + "`n"), $utf8)
Invoke-Git add docs/LOCKED-DECISIONS.md
Invoke-Git commit docs/LOCKED-DECISIONS.md -m "decision D61: Laravel 12 (Step 8.2 security advisories)" -m "Change-Request: D61"
Invoke-Git push
Write-Host 'Done: D61 recorded. Tell the agent to continue (Laravel 12).'

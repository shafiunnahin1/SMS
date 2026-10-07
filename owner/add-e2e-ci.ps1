# Owner-only helper (2026-10-07): adds the CI e2e job (owner\ci-e2e-job.yml, decision D54) to .github/workflows/ci.yml and pushes.
# The agent cannot push workflow files from its session. Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File owner\add-e2e-ci.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Invoke-Git { & git.exe @args; if ($LASTEXITCODE -ne 0) { throw "git $args failed (exit $LASTEXITCODE) - nothing after this step was done" } }
Invoke-Git pull
$utf8 = New-Object System.Text.UTF8Encoding $false
$ci = Join-Path (Get-Location) '.github\workflows\ci.yml'
$text = [IO.File]::ReadAllText($ci, $utf8)
if ($text -match '(?m)^  e2e:') { throw 'the e2e job is already in ci.yml - nothing to do' }
$job = [IO.File]::ReadAllText((Join-Path (Get-Location) 'owner\ci-e2e-job.yml'), $utf8)
[IO.File]::WriteAllText($ci, ($text.TrimEnd() + "`n" + $job), $utf8)
Invoke-Git add .github/workflows/ci.yml
Invoke-Git commit -m "ci: e2e job (Playwright smoke + axe, D54)" -m "Change-Request: D54"
Invoke-Git push
Write-Host 'Done: the e2e job is in CI.'

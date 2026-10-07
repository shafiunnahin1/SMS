# Owner-only helper (2026-10-07): records decisions D48-D53 and signs the Spike Gate as TWO human commits,
# exactly as docs/ops/agent-guardrails.md section 4 asks. Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File owner\sign-gate.ps1
# Read owner\decisions-D48-D53.md and owner\SPIKE-LOG.md first - committing them is your signature.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Git { git @args; if ($LASTEXITCODE -ne 0) { throw "git $args failed (exit $LASTEXITCODE) - nothing after this step was done" } }
if (-not (git config user.email)) { throw 'git has no user.name / user.email: run  git config --global user.name "Your Name"  and  git config --global user.email "you@example.com"  first' }
Git pull
$utf8 = New-Object System.Text.UTF8Encoding $false
$dec  = Join-Path (Get-Location) 'docs\LOCKED-DECISIONS.md'
$rows = [IO.File]::ReadAllLines((Join-Path (Get-Location) 'owner\decisions-D48-D53.md'), $utf8)
$lines = [Collections.Generic.List[string]]([IO.File]::ReadAllLines($dec, $utf8))
if (git log -1 --format=%H --grep='Change-Request: D48' -- docs/LOCKED-DECISIONS.md 2>$null) { Write-Host 'D48 already committed - skipping commit 1' }
elseif ($lines | Where-Object { $_ -like '| D48 |*' }) { Git commit docs/LOCKED-DECISIONS.md -m "decisions D48-D53: spike gate, loading, PDF, auth, fonts, language" -m "Change-Request: D48, D49, D50, D51, D52, D53" }
else {
  $at = -1; for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -like '| D47 |*') { $at = $i } }
  if ($at -lt 0) { throw 'row D47 not found in docs/LOCKED-DECISIONS.md' }
  $lines.InsertRange($at + 1, $rows)
  [IO.File]::WriteAllText($dec, (($lines -join "`n") + "`n"), $utf8)
  Git add docs/LOCKED-DECISIONS.md
  Git commit docs/LOCKED-DECISIONS.md -m "decisions D48-D53: spike gate, loading, PDF, auth, fonts, language" -m "Change-Request: D48, D49, D50, D51, D52, D53"
}
Copy-Item (Join-Path (Get-Location) 'owner\SPIKE-LOG.md') (Join-Path (Get-Location) 'docs\SPIKE-LOG.md') -Force
Git add docs/SPIKE-LOG.md
Git commit docs/SPIKE-LOG.md -m "spike log: gate signed (Go with conditions, D48)" -m "Change-Request: D48"
Git push
Write-Host 'Done: decisions D48-D53 recorded and the Spike Gate signed.'

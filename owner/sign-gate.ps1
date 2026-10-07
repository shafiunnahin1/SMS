# Owner-only helper (2026-10-07): records decisions D48-D53 and signs the Spike Gate as TWO human commits,
# exactly as docs/ops/agent-guardrails.md section 4 asks. Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File owner\sign-gate.ps1
# Read owner\decisions-D48-D53.md and owner\SPIKE-LOG.md first - committing them is your signature.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
git pull
$utf8 = New-Object System.Text.UTF8Encoding $false
$dec  = Join-Path (Get-Location) 'docs\LOCKED-DECISIONS.md'
$rows = [IO.File]::ReadAllLines((Join-Path (Get-Location) 'owner\decisions-D48-D53.md'), $utf8)
$lines = [Collections.Generic.List[string]]([IO.File]::ReadAllLines($dec, $utf8))
if ($lines | Where-Object { $_ -like '| D48 |*' }) { Write-Host 'D48 already exists - skipping commit 1' }
else {
  $at = -1; for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -like '| D47 |*') { $at = $i } }
  if ($at -lt 0) { throw 'row D47 not found in docs/LOCKED-DECISIONS.md' }
  $lines.InsertRange($at + 1, $rows)
  [IO.File]::WriteAllText($dec, (($lines -join "`n") + "`n"), $utf8)
  git add docs/LOCKED-DECISIONS.md
  git commit -m "decisions D48-D53: spike gate, loading, PDF, auth, fonts, language" -m "Change-Request: D48, D49, D50, D51, D52, D53"
}
Copy-Item (Join-Path (Get-Location) 'owner\SPIKE-LOG.md') (Join-Path (Get-Location) 'docs\SPIKE-LOG.md') -Force
git add docs/SPIKE-LOG.md
git commit -m "spike log: gate signed (Go with conditions, D48)" -m "Change-Request: D48"
git push
Write-Host 'Done: decisions D48-D53 recorded and the Spike Gate signed.'

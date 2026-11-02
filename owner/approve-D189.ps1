# Owner-run only: the agent must not execute this script.
# D189: four rows into docs/LOCKED-DECISIONS.md (D140 after D139, D152 after D151, D156 after D155, D189 after D188). One commit; no push.
$ErrorActionPreference = 'Stop'
$env:Path = "C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\python;$env:Path"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md
if ($LASTEXITCODE -ne 0) { throw 'The registry has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$nl = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$packet = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D189-verify-completion.md') -Encoding UTF8)
foreach ($pair in @(@('D140','D139'), @('D152','D151'), @('D156','D155'), @('D189','D188'))) {
  $new = $pair[0]; $after = $pair[1]
  $row = @($packet | Where-Object { $_ -match "^\| $new \|" })
  if ($row.Count -ne 1) { throw "Packet row $new missing." }
  if ($content -match "(?m)^\| $new \|") { throw "$new is already in the registry." }
  if (([regex]::Matches($content, "(?m)^\| $after \|")).Count -ne 1) { throw "Anchor $after not found once." }
  $content = [regex]::Replace($content, "(?m)^(\| $after \|[^\r\n]*)", ('$1' + $nl + $row[0].Replace('$', '$$')))
}
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m "decision: D189 spec-verification completion; D152 row restored; D140 and D156 reserved" -m "Change-Request: D140, D152, D156, D189"
if ($LASTEXITCODE -ne 0) { throw 'Commit did not complete; inspect git status.' }
Write-Host 'D189 committed locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

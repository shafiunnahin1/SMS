# Owner-run only: the agent must not execute this approval script.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md
if ($LASTEXITCODE -ne 0) { throw 'Registry has local changes; review them before approval.' }
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D87.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D87 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D86 \|' -or $content -match '(?m)^\| D87 \|') { throw 'D87 packet or registry validation failed.' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$updated = [regex]::Replace($content, '(?m)^(\| D86 \|[^\r\n]*)', ('$1' + $newline + $rows[0]))
[IO.File]::WriteAllText($registry, $updated, [Text.UTF8Encoding]::new($false))
git add -- docs/LOCKED-DECISIONS.md
if ($LASTEXITCODE -ne 0) { throw 'Staging failed; inspect registry diff.' }
git diff --cached --stat
git commit -m "docs: approve D87 adjustment and advance contract" -m "Change-Request: D87"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }

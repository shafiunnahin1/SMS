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
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D160-numeric-student-id.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D160 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D159 \|' -or $content -match '(?m)^\| D160 \|') { throw 'D160 packet or registry validation failed.' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$updated = [regex]::Replace($content, '(?m)^(\| D159 \|[^\r\n]*)', ('$1' + $newline + $rows[0]))
[IO.File]::WriteAllText($registry, $updated, [Text.UTF8Encoding]::new($false))
git add -- docs/LOCKED-DECISIONS.md
if ($LASTEXITCODE -ne 0) { throw 'Staging failed; inspect registry diff.' }
git diff --cached --stat
git commit -m "decision: approve D160 numeric student ID shared with the OMR" -m "Change-Request: D160"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }
git pull --no-rebase origin claude/r216-omr-d127
git push origin claude/r216-omr-d127

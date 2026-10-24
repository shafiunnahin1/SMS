# Owner-run only: the agent must not execute this approval script.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md
if ($LASTEXITCODE -ne 0) { throw 'Registry has local changes; review them before approval.' }
$utf8 = [Text.UTF8Encoding]::new($false)

# the decision row, after D162 (scope and rules only - no guard table or task is added)
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D163-ai-study-assistant.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D163 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D162 \|' -or $content -match '(?m)^\| D163 \|') { throw 'D163 packet or registry validation failed.' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$content = [regex]::Replace($content, '(?m)^(\| D162 \|[^\r\n]*)', ('$1' + $newline + $rows[0]))
[IO.File]::WriteAllText($registry, $content, $utf8)

git add -- docs/LOCKED-DECISIONS.md
if ($LASTEXITCODE -ne 0) { throw 'Staging failed; inspect the diff.' }
git diff --cached --stat
git commit -m "decision: approve D163 AI study assistant (self-hosted, scope and rules)" -m "Change-Request: D163"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }
git pull --no-rebase origin claude/r216-omr-d127
git push origin claude/r216-omr-d127

# Owner-run only: the agent must not execute this approval script.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md
if ($LASTEXITCODE -ne 0) { throw 'Registry has local changes; review them before approval.' }
$utf8 = [Text.UTF8Encoding]::new($false)

# the decision row, after D165 (plan only - the owner adds tasks and tables to the guard separately)
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D166-ai-quality-ocr-help.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D166 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D165 \|' -or $content -match '(?m)^\| D166 \|') { throw 'D166 packet or registry validation failed.' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$content = [regex]::Replace($content, '(?m)^(\| D165 \|[^\r\n]*)', ('$1' + $newline + $rows[0]))
[IO.File]::WriteAllText($registry, $content, $utf8)

git add -- docs/LOCKED-DECISIONS.md
if ($LASTEXITCODE -ne 0) { throw 'Staging failed; inspect the diff.' }
git diff --cached --stat
git commit -m "decision: approve D166 AI quality, OCR and software help" -m "Change-Request: D166"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }
git pull --no-rebase origin claude/r216-omr-d127
git push origin claude/r216-omr-d127

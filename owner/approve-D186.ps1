# Owner-run only: the agent must not execute this script.
# D186: the decision row only (no guard task: planning/tooling change under Change-Request D186). One commit; no push.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md
if ($LASTEXITCODE -ne 0) { throw 'Registry or guard has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)

# 1. the decision row, after D185
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D186-plan-check-line-endings.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D186 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D185 \|' -or $content -match '(?m)^\| D186 \|') { throw 'D186 packet or registry validation failed.' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$anchor = 'D185'
$content = [regex]::Replace($content, "(?m)^(\| $anchor \|[^\r\n]*)", ('$1' + $newline + $rows[0]))
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m "decision: approve D186 R2.1 plan check line endings" -m "Change-Request: D186"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }

# 3. no push here. Run infra/guard/pre_push_guard.py (refs on stdin) first, then git push - never --no-verify.
Write-Host 'D186 committed locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

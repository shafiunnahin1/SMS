# Owner-run only: the agent must not execute this approval script.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'Registry or guard has local changes; review them before approval.' }
$utf8 = [Text.UTF8Encoding]::new($false)

# 1. the decision row, after D157
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D158-exam-results-workspace.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D158 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D157 \|' -or $content -match '(?m)^\| D158 \|') { throw 'D158 packet or registry validation failed.' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$content = [regex]::Replace($content, '(?m)^(\| D157 \|[^\r\n]*)', ('$1' + $newline + $rows[0]))
[IO.File]::WriteAllText($registry, $content, $utf8)

# 2. the guard: R2.1.7 -> D158 after R2.1.6, and its one new table
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
$a = "'R2.1.6': ('D127', ['R2.1.5'])}"
$t = "'R2.1.6': {'qb_omr_forms': 'D127', 'qb_omr_scans': 'D127'}}"
if (-not $g.Contains($a) -or -not $g.Contains($t) -or $g.Contains("'R2.1.7': ('D158'")) { throw 'Guard validation failed.' }
$g = $g.Replace($a, "'R2.1.6': ('D127', ['R2.1.5']), 'R2.1.7': ('D158', ['R2.1.6'])}")
$g = $g.Replace($t, "'R2.1.6': {'qb_omr_forms': 'D127', 'qb_omr_scans': 'D127'}, 'R2.1.7': {'exam_papers': 'D158'}}")
[IO.File]::WriteAllText($guard, $g, $utf8)

git add -- docs/LOCKED-DECISIONS.md infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'Staging failed; inspect the diff.' }
git diff --cached --stat
git commit -m "decision: approve D158 exam results workspace (R2.1.7)" -m "Change-Request: D158"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }
git pull --no-rebase origin claude/r216-omr-d127
git push origin claude/r216-omr-d127

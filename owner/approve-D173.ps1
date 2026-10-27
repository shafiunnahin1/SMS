# Owner-run only: the agent must not execute this script.
# D173: (1) the decision row, (2) tasks SETC.1 -> SETC.2 in the guard (after STIM.2), with the qb_paper_variants column change. Two commits; no push.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'Registry or guard has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)

# 1. the decision row, after D172
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D173-omr-set-codes.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D173 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D172 \|' -or $content -match '(?m)^\| D173 \|') { throw 'D173 packet or registry validation failed.' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$content = [regex]::Replace($content, '(?m)^(\| D172 \|[^\r\n]*)', ('$1' + $newline + $rows[0]))
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m "decision: approve D173 paper set codes follow the OMR's A-J columns" -m "Change-Request: D173"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }

# 2. the guard: SETC.1 after STIM.2, then SETC.2; trailers D173; SETC.1 may alter qb_paper_variants
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
if ($g.Contains("'SETC.1'")) { throw 'The SETC tasks are already in the guard.' }
$t = "'BASE.3': ('D172', ['BASE.2'])"
if (-not $g.Contains($t)) { throw 'Guard validation failed (task map).' }
$g = $g.Replace($t, "$t, 'SETC.1': ('D173', ['STIM.2']), 'SETC.2': ('D173', ['SETC.1'])")
$t = "'BASE.3': ['D172']"
if (-not $g.Contains($t)) { throw 'Guard validation failed (trailers).' }
$g = $g.Replace($t, "$t, 'SETC.1': ['D173'], 'SETC.2': ['D173']")
$t = "'AI-Q5': {'ai_attachments': 'D166'}"
if (-not $g.Contains($t)) { throw 'Guard validation failed (tables).' }
$g = $g.Replace($t, "$t, 'SETC.1': {'qb_paper_variants': 'D173'}")
[IO.File]::WriteAllText($guard, $g, $utf8)
python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }
git add -- infra/guard/agent_guard.py
git commit -m "guard: D173 tasks SETC.1, SETC.2" -m "Change-Request: D173"
if ($LASTEXITCODE -ne 0) { throw 'Guard commit did not complete; inspect git status.' }

# 3. no push here. Run infra/guard/pre_push_guard.py (refs on stdin) first, then git push - never --no-verify.
Write-Host 'D173 committed locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

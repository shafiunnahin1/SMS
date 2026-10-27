# Owner-run only: the agent must not execute this script.
# D175: (1) the decision row, (2) task QBF.1 in the guard (after SETC.2), screens plus two existing read endpoints. Two commits; no push.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'Registry or guard has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)

# 1. the decision row, after D174 (or D173 if D174 is not approved)
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D175-language-filter.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D175 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D173 \|' -or $content -match '(?m)^\| D175 \|') { throw 'D175 packet or registry validation failed.' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$anchor = if ($content -match '(?m)^\| D174 \|') { 'D174' } else { 'D173' }
$content = [regex]::Replace($content, "(?m)^(\| $anchor \|[^\r\n]*)", ('$1' + $newline + $rows[0]))
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m "decision: approve D175 language-subject curriculum in question filters" -m "Change-Request: D175"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }

# 2. the guard: QBF.1 after SETC.2; trailer D175; no tables
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
if ($g.Contains("'QBF.1'")) { throw 'QBF.1 is already in the guard.' }
$t = "'SETC.2': ('D173', ['SETC.1'])"
if (-not $g.Contains($t)) { throw 'Guard validation failed (task map).' }
$g = $g.Replace($t, "$t, 'QBF.1': ('D175', ['SETC.2'])")
$t = "'SETC.2': ['D173']"
if (-not $g.Contains($t)) { throw 'Guard validation failed (trailers).' }
$g = $g.Replace($t, "$t, 'QBF.1': ['D175']")
[IO.File]::WriteAllText($guard, $g, $utf8)
python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }
git add -- infra/guard/agent_guard.py
git commit -m "guard: D175 task QBF.1" -m "Change-Request: D175"
if ($LASTEXITCODE -ne 0) { throw 'Guard commit did not complete; inspect git status.' }

# 3. no push here. Run infra/guard/pre_push_guard.py (refs on stdin) first, then git push - never --no-verify.
Write-Host 'D175 committed locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

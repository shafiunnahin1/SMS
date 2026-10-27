# Owner-run only: the agent must not execute this script.
# D172: (1) the decision row, (2) tasks BASE.1 -> BASE.2 -> BASE.3 in the guard (after STIM.3, i.e. alongside STIM.1's code). Two commits; no push.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'Registry or guard has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)

# 1. the decision row, after D171
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D172-baseline-test-repair.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D172 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D171 \|' -or $content -match '(?m)^\| D172 \|') { throw 'D172 packet or registry validation failed.' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$content = [regex]::Replace($content, '(?m)^(\| D171 \|[^\r\n]*)', ('$1' + $newline + $rows[0]))
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m "decision: approve D172 repair of seven baseline backend tests" -m "Change-Request: D172"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }

# 2. the guard: BASE.1 after STIM.3, then BASE.2, BASE.3; trailers D172
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
if ($g.Contains("'BASE.1'")) { throw 'The BASE tasks are already in the guard.' }
$t = "'STIM.2': ('D171', ['STIM.1'])"
if (-not $g.Contains($t)) { throw 'Guard validation failed (task map).' }
$g = $g.Replace($t, "$t, 'BASE.1': ('D172', ['STIM.3']), 'BASE.2': ('D172', ['BASE.1']), 'BASE.3': ('D172', ['BASE.2'])")
$t = "'STIM.2': ['D171']"
if (-not $g.Contains($t)) { throw 'Guard validation failed (trailers).' }
$g = $g.Replace($t, "$t, 'BASE.1': ['D172'], 'BASE.2': ['D172'], 'BASE.3': ['D172']")
[IO.File]::WriteAllText($guard, $g, $utf8)
python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }
git add -- infra/guard/agent_guard.py
git commit -m "guard: D172 tasks BASE.1, BASE.2, BASE.3" -m "Change-Request: D172"
if ($LASTEXITCODE -ne 0) { throw 'Guard commit did not complete; inspect git status.' }

# 3. no push here. Run infra/guard/pre_push_guard.py by hand first, then git push - never --no-verify.
Write-Host 'D172 committed locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

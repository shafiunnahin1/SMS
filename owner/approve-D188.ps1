# Owner-run only: the agent must not execute this script.
# D188: (1) the decision row, (2) task SVR.1 in the guard (after SUB.3), trailer D188. Two commits; no push.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'Registry or guard has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)

# 1. the decision row, after D187
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D188-spec-verify-repair.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D188 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D187 \|' -or $content -match '(?m)^\| D188 \|') { throw 'D188 packet or registry validation failed.' }
$content = [regex]::Replace($content, "(?m)^(\| D187 \|[^\r\n]*)", ('$1' + $(if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }) + $rows[0]))
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m "decision: approve D188 spec-verification repair" -m "Change-Request: D188"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }

# 2. the guard: SVR.1 after SUB.3; trailer D188
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
if ($g.Contains("'SVR.1'")) { throw 'SVR.1 is already in the guard.' }
$t = "'SUB.3': ('D187', ['SUB.2'])"
if (-not $g.Contains($t)) { throw 'Guard validation failed (task map).' }
$g = $g.Replace($t, "$t, 'SVR.1': ('D188', ['SUB.3'])")
$t = "'SUB.3': ['D187']"
if (-not $g.Contains($t)) { throw 'Guard validation failed (trailers).' }
$g = $g.Replace($t, "$t, 'SVR.1': ['D188']")
[IO.File]::WriteAllText($guard, $g, $utf8)
python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }
git add -- infra/guard/agent_guard.py
git commit -m "guard: D188 task SVR.1" -m "Change-Request: D188"
if ($LASTEXITCODE -ne 0) { throw 'Guard commit did not complete; inspect git status.' }
Write-Host 'D188 committed locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

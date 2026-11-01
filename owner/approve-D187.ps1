# Owner-run only: the agent must not execute this script.
# D187: (1) the decision row, (2) tasks SUB.1 -> SUB.2 -> SUB.3 in the guard (after PDFW.1) with SUB.1's three new tables. Two commits; no push.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'Registry or guard has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)

# 1. the decision row, after D186
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D187-module-subscriptions.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D187 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D186 \|' -or $content -match '(?m)^\| D187 \|') { throw 'D187 packet or registry validation failed.' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$anchor = 'D186'
$content = [regex]::Replace($content, "(?m)^(\| $anchor \|[^\r\n]*)", ('$1' + $newline + $rows[0]))
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m "decision: approve D187 module-based subscriptions and billing" -m "Change-Request: D187"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }

# 2. the guard: SUB.1 after PDFW.1, then SUB.2, SUB.3; trailer D187; SUB.1's tables
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
if ($g.Contains("'SUB.1'")) { throw 'The SUB tasks are already in the guard.' }
$t = "'PDFW.1': ('D185', ['QBG.1'])"
if (-not $g.Contains($t)) { throw 'Guard validation failed (task map).' }
$g = $g.Replace($t, "$t, 'SUB.1': ('D187', ['PDFW.1']), 'SUB.2': ('D187', ['SUB.1']), 'SUB.3': ('D187', ['SUB.2'])")
$t = "'PDFW.1': ['D185']"
if (-not $g.Contains($t)) { throw 'Guard validation failed (trailers).' }
$g = $g.Replace($t, "$t, 'SUB.1': ['D187'], 'SUB.2': ['D187'], 'SUB.3': ['D187']")
$t = "'QBO.2': {'qb_paper_revisions': 'D180', 'qb_paper_variants': 'D180', 'qb_omr_forms': 'D180'}"
if (-not $g.Contains($t)) { throw 'Guard validation failed (tables).' }
$g = $g.Replace($t, "$t, 'SUB.1': {'module_prices': 'D187', 'institution_module_subscriptions': 'D187', 'subscription_invoice_lines': 'D187'}")
[IO.File]::WriteAllText($guard, $g, $utf8)
python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }
git add -- infra/guard/agent_guard.py
git commit -m "guard: D187 tasks SUB.1-SUB.3" -m "Change-Request: D187"
if ($LASTEXITCODE -ne 0) { throw 'Guard commit did not complete; inspect git status.' }

# 3. no push here. Run infra/guard/pre_push_guard.py (refs on stdin) first, then git push - never --no-verify.
Write-Host 'D187 committed locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

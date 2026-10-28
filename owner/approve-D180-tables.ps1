# Owner-run only: the agent must not execute this script.
# D180 (5) already authorizes the revision column on qb_paper_variants and qb_omr_forms; the QBO.2 guard map listed only the new
# table qb_paper_revisions, so the guard (C3) refuses the QBO.2 migration. One guard commit adds the two tables to QBO.2; no push.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'Guard has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
$t = "'QBO.2': {'qb_paper_revisions': 'D180'}"
if (-not $g.Contains($t)) { throw 'Guard validation failed (QBO.2 table entry not as expected).' }
$g = $g.Replace($t, "'QBO.2': {'qb_paper_revisions': 'D180', 'qb_paper_variants': 'D180', 'qb_omr_forms': 'D180'}")
[IO.File]::WriteAllText($guard, $g, $utf8)
python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }
git add -- infra/guard/agent_guard.py
git commit -m "guard: D180 QBO.2 may alter qb_paper_variants and qb_omr_forms" -m "Change-Request: D180"
if ($LASTEXITCODE -ne 0) { throw 'Guard commit did not complete; inspect git status.' }
Write-Host 'Guard updated locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

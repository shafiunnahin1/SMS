# Owner-run only: the agent must not execute this script.
# D180: (1) append the immutable final-paper revision contract, (2) allow QBO.2 after QBO.1 and authorize its one new table.
# Two local commits; no push. Review owner/decision-D180-final-paper-settings-revisions.md first.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo

git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'Registry or guard has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)

# 1. append D180 after D179 in the append-only decision registry
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D180-final-paper-settings-revisions.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D180 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D179 \|' -or $content -match '(?m)^\| D180 \|') { throw 'D180 packet or registry validation failed.' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$content = [regex]::Replace($content, '(?m)^(\| D179 \|[^\r\n]*)', ('$1' + $newline + $rows[0]))
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m 'decision: approve editable final paper settings as revisions' -m 'Change-Request: D180'
if ($LASTEXITCODE -ne 0) { throw 'D180 decision commit did not complete; inspect git status.' }

# 2. register QBO.2 after QBO.1; authorize only the revision snapshot table
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
$gOriginal = $g
if ($g.Contains("'QBO.2'")) { throw 'QBO.2 is already in the guard.' }
$task = "'QBO.1': ('D179', ['QBS.1'])"
$trailer = "'QBO.1': ['D179']"
$tableAnchor = "D148_MIGRATION_FIX = 'api/database/migrations/2026_10_22_000001_create_qb_curriculum_version_class_level.php'"
if (-not $g.Contains($task) -or -not $g.Contains($trailer) -or -not $g.Contains($tableAnchor)) { throw 'Guard validation failed (QBO.1 dependency/trailer or table anchor).' }
$g = $g.Replace($task, "$task, 'QBO.2': ('D180', ['QBO.1'])")
$g = $g.Replace($trailer, "$trailer, 'QBO.2': ['D180']")
$g = $g.Replace($tableAnchor, "$tableAnchor`nR21_TABLES.update({'QBO.2': {'qb_paper_revisions': 'D180'}})")
[IO.File]::WriteAllText($guard, $g, $utf8)
py -3 infra\guard\test_guard.py
if ($LASTEXITCODE -ne 0) {
    [IO.File]::WriteAllText($guard, $gOriginal, $utf8)
    throw 'Guard self-test failed; the guard edit was restored from the checked pre-edit content.'
}
git add -- infra/guard/agent_guard.py
git commit -m 'guard: D180 task QBO.2' -m 'Change-Request: D180'
if ($LASTEXITCODE -ne 0) { throw 'D180 guard commit did not complete; inspect git status.' }

Write-Host 'D180 approval commits created locally. Not pushed. Run infra/guard/pre_push_guard.py before git push.'

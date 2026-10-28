# Owner-run only: the agent must not execute this script.
# D181: (1) append the paper-preview object-controls decision, (2) register QBO.3 after QBO.1. No table, route, package or push.
# Two local commits. Review owner/decision-D181-paper-preview-object-controls.md first.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo

git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'Registry or guard has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)

# 1. append D181 after D180 if approved, otherwise after D179
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D181-paper-preview-object-controls.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D181 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D179 \|' -or $content -match '(?m)^\| D181 \|') { throw 'D181 packet or registry validation failed.' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$anchor = if ($content -match '(?m)^\| D180 \|') { 'D180' } else { 'D179' }
$content = [regex]::Replace($content, "(?m)^(\| $anchor \|[^\r\n]*)", ('$1' + $newline + $rows[0]))
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m 'decision: approve paper preview object controls' -m 'Change-Request: D181'
if ($LASTEXITCODE -ne 0) { throw 'D181 decision commit did not complete; inspect git status.' }

# 2. register QBO.3 after QBO.1; no new schema objects
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
$gOriginal = $g
if ($g.Contains("'QBO.3'")) { throw 'QBO.3 is already in the guard.' }
$task = "'QBO.1': ('D179', ['QBS.1'])"
$trailer = "'QBO.1': ['D179']"
if (-not $g.Contains($task) -or -not $g.Contains($trailer)) { throw 'Guard validation failed (QBO.1 dependency/trailer).' }
$g = $g.Replace($task, "$task, 'QBO.3': ('D181', ['QBO.1'])")
$g = $g.Replace($trailer, "$trailer, 'QBO.3': ['D181']")
[IO.File]::WriteAllText($guard, $g, $utf8)
py -3 infra\guard\test_guard.py
if ($LASTEXITCODE -ne 0) {
    [IO.File]::WriteAllText($guard, $gOriginal, $utf8)
    throw 'Guard self-test failed; the guard edit was restored from the checked pre-edit content.'
}
git add -- infra/guard/agent_guard.py
git commit -m 'guard: D181 task QBO.3' -m 'Change-Request: D181'
if ($LASTEXITCODE -ne 0) { throw 'D181 guard commit did not complete; inspect git status.' }

Write-Host 'D181 approval commits created locally. Not pushed. Run infra/guard/pre_push_guard.py before git push.'

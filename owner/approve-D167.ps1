# Owner-run only: the agent must not execute this approval script.
# D167: approve the decision row, then apply the reviewed pre-push guard fix (owner/d167/pre-push-guard-fix.patch) in a second commit.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- docs/LOCKED-DECISIONS.md infra/guard/pre_push_guard.py infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { throw 'Registry or guard files have local changes; review them before approval.' }
# the guard files must still be exactly the versions the fix was written against
$expected = @{ 'infra/guard/pre_push_guard.py' = '548688b628ec97fcf35bd41a63c9f17234d050d9'; 'infra/guard/test_guard.py' = '50c2303868c73069648cc48a6f808a9107e3f408' }
foreach ($f in $expected.Keys) { $h = (git hash-object -- $f).Trim(); if ($h -ne $expected[$f]) { throw "$f changed since the D167 draft ($h); ask the agent to rebase the fix." } }
$utf8 = [Text.UTF8Encoding]::new($false)

# 1. the decision row, after D166
$registry = Join-Path $repo 'docs\LOCKED-DECISIONS.md'
$content = [IO.File]::ReadAllText($registry)
$rows = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decision-D167-pre-push-guard-fix.md') -Encoding UTF8 | Where-Object { $_ -match '^\| D167 \|' })
if ($rows.Count -ne 1 -or $content -notmatch '(?m)^\| D166 \|' -or $content -match '(?m)^\| D167 \|') { throw 'D167 packet or registry validation failed.' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$content = [regex]::Replace($content, '(?m)^(\| D166 \|[^\r\n]*)', ('$1' + $newline + $rows[0]))
[IO.File]::WriteAllText($registry, $content, $utf8)
git add -- docs/LOCKED-DECISIONS.md
git commit -m "decision: approve D167 pre-push guard ancestor check" -m "Change-Request: D167"
if ($LASTEXITCODE -ne 0) { throw 'Approval commit did not complete; inspect git status.' }

# 2. the reviewed fix and its self-test
$patch = Join-Path $PSScriptRoot 'd167\pre-push-guard-fix.patch'
git apply --check -- $patch
if ($LASTEXITCODE -ne 0) { throw 'The D167 patch does not apply; nothing changed in infra/guard.' }
git apply -- $patch
python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/pre_push_guard.py infra/guard/test_guard.py; throw 'Guard self-test failed; the fix was not applied.' }
git add -- infra/guard/pre_push_guard.py infra/guard/test_guard.py
git commit -m "guard: pre-push ancestor check by exit code (D167)" -m "Change-Request: D167"
if ($LASTEXITCODE -ne 0) { throw 'Fix commit did not complete; inspect git status.' }

# 3. no push here: a checkout without the pre-push hook would push unguarded. Push by hand only after the fixed guard passes:
#    python infra/guard/pre_push_guard.py  (with the push line on stdin; see the D167 packet), then git push - never --no-verify
Write-Host 'D167 committed locally. Not pushed. Run the fixed pre-push guard first (see owner/decision-D167-pre-push-guard-fix.md section 5).'

# Owner-run only: the agent must not execute this script. D164 (3): ships the module key `ai_assistant` in release R3.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging area must be empty; preserve existing staged changes.' }
git diff HEAD --quiet -- api/config/release.php docs/release/r3-scope.json
if ($LASTEXITCODE -ne 0) { throw 'release.php or r3-scope.json has local changes; review them first.' }
$decisions = [IO.File]::ReadAllText((Join-Path $repo 'docs\LOCKED-DECISIONS.md'))
if ($decisions -notmatch '(?m)^\| D164 \|') { throw 'D164 is not in docs/LOCKED-DECISIONS.md yet.' }
$utf8 = [Text.UTF8Encoding]::new($false)

# 1. the scope file: release_php.modules gains ai_assistant after donations
$scope = Join-Path $repo 'docs\release\r3-scope.json'
$s = [IO.File]::ReadAllText($scope)
if ($s.Contains('"ai_assistant"')) { throw 'ai_assistant is already in r3-scope.json.' }
$at = $s.IndexOf('"release_php"')
if ($at -lt 0) { throw 'Scope validation failed (release_php not found).' }
$re = [regex]'"donations"(\r?\n)(\s*)\]'
$m = $re.Match($s, $at)
if (-not $m.Success) { throw 'Scope validation failed (release_php.modules end not found).' }
$nl = $m.Groups[1].Value
$s = $s.Substring(0, $m.Index) + '"donations",' + $nl + '   "ai_assistant"' + $nl + $m.Groups[2].Value + ']' + $s.Substring($m.Index + $m.Length)
[IO.File]::WriteAllText($scope, $s, $utf8)

# commit 1: the scope file alone (the guard compares release.php with the scope file of the commit before it)
git add -- docs/release/r3-scope.json
$msg1 = Join-Path $env:TEMP 'module-D164-scope.txt'
[IO.File]::WriteAllText($msg1, "scope: R3 ships the ai_assistant module key (D164)`n`nChange-Request: D164`n", $utf8)
python infra/guard/agent_guard.py --staged --msg-file $msg1
if ($LASTEXITCODE -ne 0) { git reset -q -- docs/release/r3-scope.json; git checkout -- docs/release/r3-scope.json; throw 'Guard refused the scope change; it was undone.' }
git commit -F $msg1
if ($LASTEXITCODE -ne 0) { throw 'Scope commit did not complete; inspect git status.' }

# 2. release.php: the same module list
$rel = Join-Path $repo 'api\config\release.php'
$r = [IO.File]::ReadAllText($rel)
$t = "'accounting', 'donations'],"
if (-not $r.Contains($t) -or $r.Contains("'ai_assistant'")) { throw 'release.php validation failed.' }
$r = $r.Replace($t, "'accounting', 'donations', 'ai_assistant'],")
[IO.File]::WriteAllText($rel, $r, $utf8)

# 3. PROGRESS (the guard wants a progress line with every api/ change)
$progress = Join-Path $repo 'docs\PROGRESS.md'
$line = '- 2026-10-25 · AI-P1.1 (D164 (3)): owner shipped the `ai_assistant` module key - api/config/release.php and docs/release/r3-scope.json release_php.modules (owner-run owner/module-D164.ps1).'
$pt = [IO.File]::ReadAllText($progress)
$pnl = if ($pt.Contains("`r`n")) { "`r`n" } else { "`n" }
[IO.File]::WriteAllText($progress, $pt.TrimEnd() + $pnl + $line + $pnl, $utf8)

git add -- api/config/release.php docs/PROGRESS.md
$msg = Join-Path $env:TEMP 'module-D164-msg.txt'
# the subject must not start with "Release:" - the guard reads every "Key: value" line as a trailer
[IO.File]::WriteAllText($msg, "ship the ai_assistant module key (D164)`n`nTask: AI-P1.1`nRelease: R3`nChange-Request: D164`n", $utf8)
python infra/guard/agent_guard.py --staged --msg-file $msg
if ($LASTEXITCODE -ne 0) { git reset -q -- api/config/release.php docs/PROGRESS.md; git checkout -- api/config/release.php docs/PROGRESS.md; git reset -q --keep HEAD~1; throw 'Guard refused; both changes were undone.' }
git diff --cached --stat
git commit -F $msg
if ($LASTEXITCODE -ne 0) { throw 'Commit did not complete; inspect git status.' }
git pull --no-rebase origin claude/r216-omr-d127
git push origin claude/r216-omr-d127

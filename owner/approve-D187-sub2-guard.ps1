# Owner-run only: the agent must not execute this script.
# D187 SUB.2: the guard's C4 check treats `CouponController` as an R5 (plan-based) controller. D187 (6) approves coupons in SUB.2,
# so this lets task SUB.2 (only) name that controller - the same way R21_TABLES lets it create the coupon tables. One commit; no push.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
git diff HEAD --quiet -- infra/guard/agent_guard.py
if ($LASTEXITCODE -ne 0) { throw 'The guard has local changes; review them first.' }
$utf8 = [Text.UTF8Encoding]::new($false)
$guard = Join-Path $repo 'infra\guard\agent_guard.py'
$g = [IO.File]::ReadAllText($guard)
if ($g.Contains('R21_CONTROLLERS')) { throw 'R21_CONTROLLERS is already in the guard.' }
$nl = if ($g.Contains("`r`n")) { "`r`n" } else { "`n" }

# 1. the map, on the line after R21_TABLES.update(...)
$m = [regex]::Match($g, "(?m)^R21_TABLES\.update\(\{'QBO\.2':[^\r\n]*\r?\n")
if (-not $m.Success) { throw 'Guard validation failed (R21_TABLES.update line).' }
$g = $g.Insert($m.Index + $m.Length, "R21_CONTROLLERS = {'SUB.2': {'CouponController': 'D187'}}   # D187: a later-release controller name a task may use$nl")

# 2. C4: skip that controller for that task when its decision is already on the base branch
$t = "                    if c in st['controllers']: continue$nl"
if (([regex]::Matches($g, [regex]::Escape($t))).Count -ne 1) { throw 'Guard validation failed (C4 line).' }
$add = "                    r21_ctrl = R21_CONTROLLERS.get((tr.get('task') or [''])[0] or '', {}).get(c)$nl" +
       "                    if r21_ctrl and re.search(r'^\| %s \|' % r21_ctrl, base_dec, re.M): continue$nl"
$g = $g.Replace($t, $t + $add)
[IO.File]::WriteAllText($guard, $g, $utf8)

python infra/guard/test_guard.py
if ($LASTEXITCODE -ne 0) { git checkout -- infra/guard/agent_guard.py; throw 'Guard self-test failed; the change was undone.' }
git add -- infra/guard/agent_guard.py
git commit -m "guard: D187 lets SUB.2 name CouponController" -m "Change-Request: D187"
if ($LASTEXITCODE -ne 0) { throw 'Guard commit did not complete; inspect git status.' }
Write-Host 'Committed locally. Not pushed. Run infra/guard/pre_push_guard.py first, then git push.'

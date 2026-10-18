# D105 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D104 row)

Why: agent commit 5a5d04a (R3.8) added four rows to the protected api/tests/Fixtures/role-matrix.php for the four R3.8 plan routes
(POST /hr/final-settlement/{type}/{id}/start, GET+POST /hr/pf/entries, GET /hr/pf/{type}/{id}/statement.pdf - all admin/accountant,
exactly as docs/AGENT-PLAN-R3.md R3.8) without a Change-Request trailer. No existing row or assertion changed. The agent's own command
hid the guard failure (output piped through tail); that was the agent's error, not a guard defect.

| D105 | R3.8 route-matrix rows | Owner approved (2026-10-18). The four R3.8 plan routes (final settlement start, PF entries index/store, PF statement PDF) are admin/accountant only and principal-only for department staff; the four role-matrix fixture rows and catalogue entries added in commit 5a5d04a are accepted as written. This row is the Change-Request for that commit; future protected-path changes still need their trailer in the same commit. |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad docs\LOCKED-DECISIONS.md
    # paste the row above on a new line right after the "| D104 |" row, save, close
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D105 R3.8 route-matrix rows" -m "Change-Request: D105"
    git push origin claude/elegant-cori-gw2mw5

Note: the CI guard checks each commit's own trailer, so commit 5a5d04a will still be reported. When you merge PR #1, a squash merge whose
message includes "Change-Request: D105" gives main one clean commit. History rewriting is not something the agent may do.

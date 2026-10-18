# D107 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D106 row)

Why: R3.11 adds the 21 donation routes of docs/AGENT-PLAN-R3.md. Every authenticated route needs a row in the protected
api/tests/Fixtures/role-matrix.php (Change-Request needed, as with D105/D106). The other points write down the conservative
choices from docs/modules/donations.md so the agent does not guess.

| D107 | R3.11 donations contract | Owner approved (2026-10-18). (1) The 21 R3.11 donation routes are admin/accountant only (module donations, opt-in) and principal-only for department staff; teacher, student and parent never see donor data; the agent may add their role-matrix fixture rows, catalogue entries and tenancy-test registrations under Change-Request D107; no existing row or assertion changes. (2) Money donations only, receipt DON-{YYYY}-{seq}; a donation is never edited or deleted, a correction is a new reversed row (D32). (3) Fund balance = received − reversed − expenses with that fund_id; an expense (or a donation reversal) that would take a restricted fund below zero is 422 fund_overdrawn; expenses may carry fund_id only when the donations module is on. (4) Cash donations and their reversals count in the cash book; with accounting on a donation posts Dr cash/bank/mobile · Cr 4300.<fund_id> (reversal swaps), fund expenses post to their mapped expense account. (5) No religious or legal ruling (D39); no online donations, no public donor list, no SMS thank-you in this task; tax-receipt wording stays the owner's open decision. |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad docs\LOCKED-DECISIONS.md
    # Ctrl+F "| D106 |", click at the end of that line, Enter, paste the row, Ctrl+S, close
    git status
    # must show only: modified: docs/LOCKED-DECISIONS.md
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D107 R3.11 donations contract" -m "Change-Request: D107"
    git push origin claude/elegant-cori-gw2mw5

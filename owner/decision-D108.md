# D108 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D107 row)

| D108 | R3 payroll rules accepted (RELEASE-3.md §ঙ item 13) | Owner approved (2026-10-18). (1) The owner accepts the payroll rules in owner/payroll-review-checklist.md items 1-22 as they work now, after confirming them with several institutions that already run on these rules; this is the owner's acceptance, not a signed accountant/lawyer opinion, and the owner carries that responsibility. (2) Gratuity and leave encashment are not part of R3. (3) PF and tax at source stay off by default; every rate, slab and limit is the institution's own setting. (4) Payroll runs with tax withheld stay unposted in accounting until a tax-payable account is chosen. (5) A different rule for a future institution is added only through a new owner decision and its own task, never by changing these rules silently. |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad docs\LOCKED-DECISIONS.md
    # Ctrl+F "| D107 |", click at the end of that line, Enter, paste the row, Ctrl+S, close
    git status
    # must show only: modified: docs/LOCKED-DECISIONS.md
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D108 R3 payroll rules accepted" -m "Change-Request: D108"
    git push origin claude/elegant-cori-gw2mw5

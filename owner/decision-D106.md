# D106 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D105 row)

Why: R3.10 adds the 20 accounting routes of docs/AGENT-PLAN-R3.md. Every authenticated route needs a row in the protected
api/tests/Fixtures/role-matrix.php, which an agent may change only under a Change-Request decision (lesson of D105). The other points
are the conservative defaults of docs/modules/accounting.md, written down so the agent does not guess.

| D106 | R3.10 accounting contract | Owner approved (2026-10-18). (1) The 20 R3.10 accounting routes are admin/accountant only (module accounting) and principal-only for department staff; the agent may add their role-matrix fixture rows, catalogue entries and tenancy-test registrations under Change-Request D106; no existing row or assertion changes. (2) Cash basis (no receivables), double entry Σdebit=Σcredit per voucher, posted vouchers immutable (correction = reversing voucher, D32), one automatic voucher per source record by a database unique key, start_date and locked_until per accounting.md §1. (3) Automatic posting covers fee receipts, fee refunds, expenses, payroll payments, salary advances and store movements; donation posting waits for R3.11. (4) The default chart and report names are samples until the institution's accountant confirms them (accounting.md, not verified for Bangladesh standards); no bank-specific statement format. |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad docs\LOCKED-DECISIONS.md
    # Ctrl+F "| D105 |", click at the end of that line, Enter, paste the row, Ctrl+S, close
    git status
    # must show: modified: docs/LOCKED-DECISIONS.md
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D106 R3.10 accounting contract" -m "Change-Request: D106"
    git push origin claude/elegant-cori-gw2mw5

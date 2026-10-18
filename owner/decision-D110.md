# D110 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D109 row)

| D110 | R2.1 keeps qbank's user experience unchanged | Owner approved (2026-10-18). (1) For every R2.1 workflow — question writing/editor, question import (AI-JSON/TOON/PDF), question list and filters, question paper creation, paper sets/variants, paper printing, OMR sheet generation, OMR scanning, and result creation — School Management reproduces qbank's existing screens: same layout, sections, field order, button names, step sequence, print/OMR output and keyboard behaviour, so existing qbank users need no retraining; no redesign and no new workflow. (2) It is rebuilt inside School Management's React app (as D72 did for the editor), using the theme tokens, translations, RTL rules, login, tenancy and permissions of School Management; qbank's Blade pages are not embedded. (3) Where a School Management rule forces a visible difference (e.g. theme colours, Bangla/English text keys), the change is the smallest possible and is listed for the owner in that task's evidence. (4) The qbank baseline (docs/release/r21-baseline, D109) and qbank's screens at revision 40f769c are the reference; each R2.1 task's acceptance includes a side-by-side check against them. (5) This decides the UI approach only; each R2.1 task still needs its own refined-scope decision before code. |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad docs\LOCKED-DECISIONS.md
    # Ctrl+F "| D109 |", click at the end of that line, Enter, paste the row, Ctrl+S, close
    git status
    # must show only: modified: docs/LOCKED-DECISIONS.md
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D110 R2.1 keeps qbank UX" -m "Change-Request: D110"
    git push origin claude/elegant-cori-gw2mw5

# D125 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D124 row)

| D125 | Bijoy (legacy Bangla font) text in a PDF is converted to Unicode, line by line (completes D124 (1); G7 exception for this one package) | Owner approved (2026-10-19). A question PDF may hold Bijoy-encoded and Unicode Bangla together, even on the same page. SMS adds qbank's own converter package `mirazmac/bangla-string` v1.1 (MIT, its BijoyToAvro translator) - the only package this decision allows, added only in its implementation commit, not in package.json. The PDF import converts each LINE separately: a line is converted only when it shows qbank's Bijoy signals (Bijoy characters/sequences such as †, ‡, Av, ‡K, cÖ, with the font named in the PDF or a strong signal) and the converted line has more Bangla letters than before; a line already in Unicode Bangla, English, numbers or LaTeX is left exactly as it is. A converted line is marked on the staged question ("converted from Bijoy - check the spelling"); nothing is converted silently. Acceptance: a fixture page mixing a Bijoy line and a Unicode line gives the right Unicode for the first and the second unchanged; an all-Unicode PDF is unchanged byte for byte. Implementation commits carry `Change-Request: D125`. |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git checkout claude/elegant-cori-gw2mw5
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad owner\decision-D125.md
    notepad docs\LOCKED-DECISIONS.md
    # Ctrl+F "| D124 |", press End, Enter, Ctrl+V the row, Ctrl+S, close
    git status
    # must show only: modified: docs/LOCKED-DECISIONS.md
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D125 Bijoy to Unicode for PDF imports" -m "Change-Request: D125"
    git push origin claude/elegant-cori-gw2mw5

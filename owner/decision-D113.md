# D113 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D112 row)

| D113 | Question import covers every language and question type (amends D110 for import only) | Owner approved (2026-10-18). qbank's JSON and PDF import handles only Bangla questions and only some question types, while qbank's editor handles English questions and every type. In School Management the import (R2.1.3 JSON/TOON, R2.1.4 PDF) must accept everything the editor accepts: Bangla and English questions, and every question type in `qb_question_types` (MCQ, creative, short, structured and the rest), with their options, parts, answers, explanations, LaTeX and images. The screens and steps of import keep qbank's look and order (D110); only the coverage grows. A question the importer cannot read goes to the review list with the reason, never dropped silently. This does not unblock R2.1.3 or R2.1.4: each still needs its own refined-scope decision; this row is a requirement those decisions must include. |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git checkout claude/elegant-cori-gw2mw5
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad owner\decision-D113.md
    notepad docs\LOCKED-DECISIONS.md
    # Ctrl+F "| D112 |", click at the end of that line, Enter, paste the row, Ctrl+S, close
    git status
    # must show only: modified: docs/LOCKED-DECISIONS.md
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D113 import covers every language and question type" -m "Change-Request: D113"
    git push origin claude/elegant-cori-gw2mw5

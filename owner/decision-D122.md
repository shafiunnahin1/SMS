# D122 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D121 row)

| D122 | Guard exception for the local OCR copy `frontend/public/vendor/tesseract/**` (completes D121, same rule as D119) | Owner approved (2026-10-19). The D121 files are third-party builds copied unchanged: the minified tesseract.js scripts contain `console.log` (guard C7), the wasm engine files hold a long base64 string in which the AWS-key pattern happens to match (guard C8, a false alarm - there is no key), and the folder (13 MB) is larger than a normal commit (C11). `infra/guard/agent_guard.py` therefore treats `frontend/public/vendor/tesseract/` like the qbank folder: C7, C8 and C11 do not apply to it, and instead every add/change/remove under it must update its `MANIFEST.sha256` in the same commit, the manifest must list exactly the files present with matching sha256, and the commit must carry `Change-Request: D121` or a later decision (C1). The guard change itself is a separate commit with `Change-Request: D122`, merged to main before the files (CI runs main's guard). |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git checkout claude/elegant-cori-gw2mw5
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad owner\decision-D122.md
    notepad docs\LOCKED-DECISIONS.md
    # Ctrl+F "| D121 |", press End, Enter, Ctrl+V the row, Ctrl+S, close
    git status
    # must show only: modified: docs/LOCKED-DECISIONS.md
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D122 guard exception for the OCR copy" -m "Change-Request: D122"
    git push origin claude/elegant-cori-gw2mw5

# D119 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D118 row)

| D119 | The copied qbank tool files are checked as a copy, not as our code (guard exception for `frontend/public/vendor/qbank/**`) | Owner approved (2026-10-19). The 114 files D118 (1) copies from qbank revision 40f769c into `frontend/public/vendor/qbank/` are qbank's code, kept unchanged; one of them alone is 6,689 lines and two contain `console.log`. So the agent guard does not apply C7 (forbidden-code patterns) or C11 (commit size) to paths under `frontend/public/vendor/qbank/`, and these files may arrive in commits larger than the C11 limit. In exchange the copy is pinned: `frontend/public/vendor/qbank/MANIFEST.sha256` lists every file with its sha256 as copied, the files differ from qbank only in the loading path D118 allows (one line in `js/diagram/diagram-editor-lazy-loader-v1.js`, recorded in the manifest's header), and a guard check (and a frontend test) fails when any file under that folder is added, changed or removed without the same commit updating the manifest under `Change-Request: D119` or a later decision. Every other rule (C1 protected paths, C8 secrets, C9/C10 task order, C14 dependencies) still applies to those commits, and no code outside that folder is exempted. Owner authorizes the matching change to `infra/guard/agent_guard.py` and its tests under `Change-Request: D119`; it must reach `main` before the vendor commit. |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git checkout claude/elegant-cori-gw2mw5
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad owner\decision-D119.md
    notepad docs\LOCKED-DECISIONS.md
    # Ctrl+F "| D118 |", click at the end of that line, Enter, paste the row, Ctrl+S, close
    git status
    # must show only: modified: docs/LOCKED-DECISIONS.md
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D119 guard exception for the copied qbank tools" -m "Change-Request: D119"
    git push origin claude/elegant-cori-gw2mw5

# D120 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D119 row)

| D120 | qbank's own SweetAlert2 copy comes with its tools (amends D118 (1), G7 exception for this file only) | Owner approved (2026-10-19). qbank's graph dialog and eight of the copied tool files need SweetAlert2 (`window.Swal`); without it the graph tool stops with "SweetAlert2 is required". qbank keeps a local copy, `public/vendor/sweetalert2/sweetalert2.all.min.js` (v11.26.25, MIT License, 79 KB), which is copied unchanged into `frontend/public/vendor/qbank/vendor/sweetalert2/`, listed in `MANIFEST.sha256` (D119), and loaded by the editor only when a qbank tool first opens, before the tools - never from the internet (qbank's page also tries a CDN; SMS does not). It is not added to package.json or any lockfile and is not used by SMS's own React code. Implementation commits carry `Change-Request: D120`. |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git checkout claude/elegant-cori-gw2mw5
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad owner\decision-D120.md
    notepad docs\LOCKED-DECISIONS.md
    # Ctrl+F "| D119 |", click at the end of that line, Enter, paste the row, Ctrl+S, close
    git status
    # must show only: modified: docs/LOCKED-DECISIONS.md
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D120 qbank's SweetAlert2 copy" -m "Change-Request: D120"
    git push origin claude/elegant-cori-gw2mw5

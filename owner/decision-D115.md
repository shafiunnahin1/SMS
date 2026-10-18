# D115 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D114 row)

| D115 | Graph and diagram tools come from qbank's code; graph datasets get their own table (amends D72, D114 (2)) | Owner approved (2026-10-18). (1) Tools: qbank's graph tool (graph core, its plugins - calculus, composite, geometry, implicit, piecewise, region, statistics) and its diagram editors (circuit, geometry, timeline, waveform, Venn, UML, cells, anatomy and the rest, about 60) are brought over from qbank revision 40f769c as they are, wrapped for the SMS React editor; they keep qbank's look and behaviour (D110). Only working files are copied (no `*.backup*`, `*.bak`, `*.remote` copies), no file is loaded from the internet, and no other qbank file is copied (D109 still applies). (2) Storage in a question: a graph or diagram is saved inside the question's rich text as qbank does - an element carrying `data-qmx-graph`, or `data-qmx-diagram` with `data-qmx-diagram-mode` and `data-qmx-diagram-payload` (JSON) - and drawn on screen by the copied renderer. The D72 sanitizer allowlist is extended for exactly these attributes on a `div`; the JSON is checked on save (valid JSON, size limit, known mode) and is never run as code; any other attribute or tag stays removed. The printed paper draws them with the same renderer inside the Chromium print page (local script, no network); if a mode cannot be drawn there, the paper prints a clear placeholder instead of breaking. (3) Graph datasets: a new platform table `qb_graph_datasets` like qbank's `graph_datasets` (uuid, name, source type, headers, row and column counts, checksum, version, rows, metadata, the question it belongs to, created_by, timestamps, soft delete), with qbank's limits (50,000 rows, 80 columns, 1,000,000 cells, 2,048 characters per cell); added to docs/database/schema.sql and as a new migration (G6). Writers and the Super Admin create and edit them, moderators review them with the question; a dataset used by a published question cannot be deleted; an edit made on an old version is refused. (4) Each part is tested: every copied mode opens, saves, reopens and prints in a fixture; the sanitizer test proves a script inside the payload never runs. Owner authorizes the matching schema.sql, question-bank.md and sanitizer changes under `Change-Request: D115`. |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git checkout claude/elegant-cori-gw2mw5
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad owner\decision-D115.md
    notepad docs\LOCKED-DECISIONS.md
    # Ctrl+F "| D114 |", click at the end of that line, Enter, paste the row, Ctrl+S, close
    git status
    # must show only: modified: docs/LOCKED-DECISIONS.md
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D115 graph and diagram tools, graph datasets table" -m "Change-Request: D115"
    git push origin claude/elegant-cori-gw2mw5

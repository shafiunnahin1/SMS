# D118 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D117 row)

| D118 | R2.1.2 graph and diagram tools in the editor (lifts D116's deferral of the editor/paper integration only) | Owner approved (2026-10-19). Authorize the R2.1.2 slice that puts qbank's graph tool and diagram editors into the SMS question editor, as D115 (1)(2) describe: (1) qbank's working files under `public/js/math` (core and tools) and `public/js/diagram`, plus `public/js/question-graph-renderer-v1.js`, are copied from qbank revision 40f769c into `frontend/public/vendor/qbank/` unchanged except for loading paths (no `*backup*`, `*.bak`, `*.remote`, `*.corrupted*` copies, nothing loaded from the internet); a React wrapper opens them from the editor's ribbon and puts the result into the field being edited. (2) Storage follows qbank exactly: a graph is the text token `[[qmx-graph:...]]` inside the question text (no sanitizer change needed for it); a diagram is the element qbank writes (`data-qmx-diagram`, `data-qmx-diagram-mode`, `data-qmx-diagram-payload`), which the D72 sanitizer may keep on a `div` only, with the payload checked on save (valid JSON, at most 256 KB, a mode qbank knows) and never run as code. (3) Display: the question preview, the writer's and moderator's pages, and the institution/student views draw graphs and diagrams with the copied renderers. (4) Print: the paper draws them with the same renderers inside the Chromium print page from local files; a mode that cannot be drawn prints a clear placeholder. (5) Routes: the five D116 dataset routes plus `GET /writer/graph-datasets/capabilities` (content_writer, content_moderator, super_admin), which the copied tool reads before it lists saved datasets. (6) Tests: every copied graph mode and diagram mode opens, inserts, saves, reopens, displays and prints in a fixture; the sanitizer test proves script inside a payload never runs; the leak test proves an answer-only graph or diagram stays locked. Authorize the matching updates to docs/release/r21-scope.json, infra/spec-verify/gen_r21_plan.py and its tests, and the regenerated R2.1 plans for this slice only. Keep the parent R2.1.2 task unchecked; the question finder, later R2.1 tasks and the runtime/module switch stay unauthorized; no new table or package. Implementation commits carry `Change-Request: D118`. |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git checkout claude/elegant-cori-gw2mw5
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad owner\decision-D118.md
    notepad docs\LOCKED-DECISIONS.md
    # Ctrl+F "| D117 |", click at the end of that line, Enter, paste the row, Ctrl+S, close
    git status
    # must show only: modified: docs/LOCKED-DECISIONS.md
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D118 graph and diagram tools in the editor" -m "Change-Request: D118"
    git push origin claude/elegant-cori-gw2mw5

# D114 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D113 row)

| D114 | R2.1.2 scope: question formats, graph datasets and the question finder | Owner approved (2026-10-18). R2.1.2 may be built, after R2.1.1, with this refined scope; screens keep qbank's look and order (D110). (1) Formats: every question type in `qb_question_types`, in Bangla and English, can be created, saved, reopened, edited, previewed and printed in the existing editor (QB.3/QB.12, D72-D74 layout, metadata and mixed items); images can be uploaded, attached, replaced and removed, and private media is served only to people allowed to see that question. (2) Graph datasets (qbank's graph/visual data): a dataset belongs to the platform question bank, is created and edited by content writers (and the Super Admin) and is reviewed with the question that uses it; a dataset in use by a published question cannot be deleted, an edit made on an old copy is refused (no silent overwrite), and nobody outside the question bank's writers, moderators and Super Admin can change it. (3) Question finder (qbank's): type or paste a question's text, optionally narrowed by class, subject, chapter, topic, question type and language, and get the closest published questions in ranked order; an unsure match is shown as unsure and the user picks by hand; the finder never shows an answer the user may not see (bought or allowed). In R2.1.2 the finder is for content writers, moderators and the Super Admin; private-batch admins, school staff and students get it in their own later task. Text-from-a-photo reading works only if it runs inside the browser with no outside service; otherwise that part stops and asks. (4) No new package, outside service or table beyond what this scope needs is added without its own decision; a new table follows docs/database/schema.sql (G6) and needs a schema change request first. (5) The agent guard admits R2.1.2 (depends on R2.1.1) under this decision; every other R2.1 task stays blocked. |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git checkout claude/elegant-cori-gw2mw5
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad owner\decision-D114.md
    notepad docs\LOCKED-DECISIONS.md
    # Ctrl+F "| D113 |", click at the end of that line, Enter, paste the row, Ctrl+S, close
    git status
    # must show only: modified: docs/LOCKED-DECISIONS.md
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D114 R2.1.2 scope" -m "Change-Request: D114"
    git push origin claude/elegant-cori-gw2mw5

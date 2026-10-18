# D112 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D111 row)

| D112 | Question-bank users and their powers (amends D111 (1)) | Owner approved (2026-10-18). (1) Mapping change: qbank "user" (searches questions, tops up the wallet, builds exam papers/sets, scans OMR) is NOT a content_writer; each becomes the admin of their own private-batch institution, which is created only through Super Admin provisioning and approval (D90) - the importer plans it and never creates it. qbank "teacher" → content_writer (unchanged); admin/moderator → content_moderator (unchanged). (2) Private-batch admin: question search, wallet top-up, question papers and paper sets, quizzes, OMR sheet generation and OMR scanning. (3) School teachers and staff: only the question-bank features the school grants them (department duties / exact permission keys, as D90-D104), nothing by default. (4) Students: view question papers, top up the wallet and buy questions; a bought question shows its answer. A student account created by a school or private batch may take the quizzes of its own teachers. A self-registered student belongs to no institution and may take only public quizzes made by writers/moderators; public quizzes may carry prizes. (5) Self-registration for students, quiz creation by schools/private batches, and public-quiz prizes are new features: each is built in its own later R2.1 task with its own refined-scope decision, not in R2.1.1; R2.1.1 only changes the importer mapping and the portal rules above. |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad owner\decision-D112.md
    notepad docs\LOCKED-DECISIONS.md
    # Ctrl+F "| D111 |", click at the end of that line, Enter, paste the row, Ctrl+S, close
    git status
    # must show only: modified: docs/LOCKED-DECISIONS.md
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D112 question-bank users and powers" -m "Change-Request: D112"
    git push origin claude/elegant-cori-gw2mw5

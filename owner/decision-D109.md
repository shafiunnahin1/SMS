# D109 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D108 row)

Why: every R2.1 task is blocked until the owner approves a refined, executable scope (D83). This approves ONLY R2.1.0 — the
measured baseline of the source project shafiunnahin1/qbank — and says exactly how it may be run, so later R2.1 tasks are planned
from observed behaviour instead of guesses. It authorizes no new School Management table, route, module or package.

| D109 | R2.1.0 baseline scope approved | Owner approved (2026-10-18). (1) R2.1.0 becomes executable: the source is shafiunnahin1/qbank at the pinned revision 40f769c966c90217de654e7fad846b2ac5cfb980 (branch feat/occurrence-sources); the agent may install its dependencies, run its migrations and seeders on a fresh disposable local database, run its own test suite and measure it, inside the agent's sandbox only. (2) No real or production data: the agent must not read, load or copy remote-qbank-env.env, any .env, academic_sync.sql or any other database dump or credential file in that repo; only qbank's own seeders and generated fixtures are used; no network calls to qbank's live servers, mail, SMS or payment services. (3) qbank is read-only: no commits, branches or pushes to shafiunnahin1/qbank. (4) Output is written in School Management under docs/release/r21-baseline/ (the agent may create and edit files there under Change-Request D109): the source route/action inventory, the observed test results, measured timings for import/PDF/OMR paths that run without external services, and a fixture registry with stable fixture IDs; anything that cannot run without an external service or real data is listed as not measured, with the reason. (5) R2.1.0 is accepted only by the owner after reading that baseline; it does not authorize any R2.1.1+ code, schema, endpoint or module, and each later task still needs its own refined scope decision. |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad docs\LOCKED-DECISIONS.md
    # Ctrl+F "| D108 |", click at the end of that line, Enter, paste the row, Ctrl+S, close
    git status
    # must show only: modified: docs/LOCKED-DECISIONS.md
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D109 R2.1.0 baseline scope" -m "Change-Request: D109"
    git push origin claude/elegant-cori-gw2mw5

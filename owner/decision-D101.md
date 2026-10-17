# D101 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D100 row)

Owner answered in chat on 2026-10-17: Q1-(a), Q2-(b) (docs/BLOCKED.md, 2026-10-17 "R3.6b next steps").

| D101 | R3.6b reviewed legacy staff mapping storage and staged switch | Owner approved (2026-10-17). (1) A reviewed legacy staff mapping is stored in a new append-only tenant table `staff_mapping_reviews` (institution_id, user_id, nullable teacher_id / staff_member_id, decision, reviewed_by, reviewed_at, note; rows are never updated or deleted, a correction is a new row), plus a per-institution switch flag on `institutions` (`staff_department_mode` enum legacy / department, default legacy, with switched_by / switched_at). Schema follows this decision through `docs/database/schema.sql` and a new migration. (2) A tenant may switch only with zero unresolved identity collisions in `staff:mapping-dry-run` and a reviewed row for every in-scope user; switching back is allowed and revokes sessions, and never restores revoked grants or rewrites history. (3) After a switch, legacy `role:teacher` / `role:admin,accountant` routes keep working side by side with the department checks until each route's department enforcement is verified by its test; then the legacy role is removed from that route under a later task step. Admin, student, parent and platform roles are unchanged. |

## How to add it (Windows PowerShell, one command per line)

    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    # open docs/LOCKED-DECISIONS.md, paste the row above on a new line right after the "| D100 |" row, save
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D101 reviewed staff mapping storage and staged switch" -m "Change-Request: D101"
    git push origin claude/elegant-cori-gw2mw5

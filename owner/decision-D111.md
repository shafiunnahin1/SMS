# D111 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D110 row)

| D111 | R2.1.1 scope: qbank identities, roles, Google sign-in and portals | Owner approved (2026-10-18). (1) Role mapping from qbank to School Management: super-admin → super_admin; admin → content_moderator; moderator → content_moderator; user → content_writer; a qbank institution's owner → that institution's admin; its teacher members → teacher; its students → student; no other role is created and no role grants more than it does in School Management today. (2) Identity: accounts are matched only by a verified email (or a verified phone where School Management uses one); two qbank accounts on one email, an email already used in School Management, or an unverified contact go to a review list for the owner and are never merged automatically; passwords are never copied in plain form, a matched user signs in with their existing School Management password or sets one through the normal reset/activation flow. (3) Google sign-in is added, as in qbank: the package google/apiclient ^2.19 (the same as qbank) may be added under Change-Request D111 (G7 exception for this package only); the server verifies the Google ID token (audience = the configured client ID, issuer, expiry, email_verified) and signs in only an existing, active account with the same verified email, or links it once; it never creates an account, never bypasses activation, school approval or tenancy, and the client ID lives only in .env (placeholder in .env.example). The button appears on the same login pages as in qbank (D110). (4) Portals: writers and moderators keep the central-host panel; their dashboards and menus follow qbank's screens (D110) and stay separate — a writer cannot publish, a moderator cannot author, earn or withdraw, and school users cannot enter central tools. (5) The importer for qbank users, institutions, members and students is a command tested only on generated fixtures; running it on real qbank data is a separate owner step after a dry-run report. (6) Allowed in this task: the mapping table and review list, the Google sign-in service and route, the importer command, the portal/menu changes and their tests; no new School Management table is created unless listed in the R2.1.1 refined plan the agent proposes and the owner approves first. |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad docs\LOCKED-DECISIONS.md
    # Ctrl+F "| D110 |", click at the end of that line, Enter, paste the row, Ctrl+S, close
    git status
    # must show only: modified: docs/LOCKED-DECISIONS.md
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D111 R2.1.1 identities, roles, Google sign-in" -m "Change-Request: D111"
    git push origin claude/elegant-cori-gw2mw5

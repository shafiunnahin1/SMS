# D102 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D101 row)

Owner answered in chat on 2026-10-17: "yes" to opening inventory to department staff. D100 made the R3.9 store/inventory routes principal_only with no `staff.inventory.*` keys, so an agent cannot open them without a new decision row.

| D102 | R3.9 inventory routes for department staff | Owner approved (2026-10-17). The nine R3.9 store/inventory routes (items list/create/update/delete, item ledger, stock, reports, sale receipt PDF, stock movements) may be opened to `institution_staff` beside admin/accountant, each behind its own exact duty key: `staff.inventory.item_index`, `staff.inventory.item_store`, `staff.inventory.item_update`, `staff.inventory.item_destroy`, `staff.inventory.ledger`, `staff.inventory.stock`, `staff.inventory.report`, `staff.inventory.receipt`, `staff.inventory.movement`, with the X-Department-Id context and the `inventory` module gate. Stock and money rows stay append-only (D32). This amends D100 for these routes only. |

## How to add it (Windows PowerShell, one command per line)

    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    # open docs/LOCKED-DECISIONS.md, paste the row above on a new line right after the "| D101 |" row, save
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D102 inventory routes for department staff" -m "Change-Request: D102"
    git push origin claude/elegant-cori-gw2mw5

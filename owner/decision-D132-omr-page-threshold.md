# Draft decision D132 — per-photo mark threshold and code-checked orientation (amends D131's fixed 0.70 / +0.22)

**Evidence (owner's four paper photos, 2026-10-20, read offline with the committed reader):** pen marks that do not fill the
bubble score 0.46-0.64 on a clean photo, while empty bubbles score 0.02-0.32. D131's fixed ">= 0.70" rejects those real marks
(clean photo: roll `??????`, many answers lost). On the monitor photo, empties were 0.4-0.64. No fixed number fits both.

Prototype - one threshold per photo, split by Otsu over all of that sheet's bubbles (roll, set, answers); a row with a score within
0.06 of the threshold is "uncertain"; the page way-up is chosen by the printed form-code bits (correlation), and a page whose code
does not match (< 0.5) is treated as unreadable:
- clean photo: roll 30?099 (one digit flagged), set গ, 19 of 20 answers as visible (1 flagged);
- shadow photo: roll 303132, set flagged, 17 of 20 as visible, the rest flagged;
- sideways photo: roll 2?1377 (the empty column shows as ?), set খ, answers read with several flagged;
- upside-down photo with a second sheet's corner in view: code match 0.18 -> unreadable, sent for manual reading (never guessed).

**Options:**
- **A (recommended):** per-photo Otsu threshold with the ±0.06 uncertain band and code-checked orientation (as above); qbank's rule
  still runs and any row where it disagrees is flagged (as D131). No server or table change.
- **B:** keep D131's fixed numbers (clean photos with light pen marks lose most marks to review).

**Proposed row (A):** `| D132 | Per-photo OMR mark threshold (amends D131's fixed numbers) | Owner approved (2026-10-20). The browser reader takes one mark threshold per photo by Otsu over all of that sheet's bubbles (roll, set, answers), clamped to 0.15-0.85; a row with a score within 0.06 of it is uncertain and goes to review. The page's way-up is chosen by the printed form-code bits (correlation); below 0.5 the page counts as unreadable (sent with blank answers for manual reading). qbank's rule still runs: any row where it disagrees is flagged (as D131). No server or table change. |`

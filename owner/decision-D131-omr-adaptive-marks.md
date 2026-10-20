# Draft decision D131 — OMR mark detection on weak photos (amends D127 "reader ported unchanged in its rules")

**Evidence (owner's phone photo of the sample sheet shown on a monitor, 2026-10-20):** after paper cropping and alignment, every filled bubble scores 0.73–1.00, but empty bubbles score 0.41–0.64 (the printed digit inside each bubble, screen moiré). qbank's rule (a mark = score ≥ 0.16 and ≥ the row's lower-half mean + 0.10) then reads:
- roll: `??????` (every digit column "several marks");
- answers: 14 of 20 as visible on the sheet; 5 rows "ambiguous"; **row 12 (empty) read as "ঘ" — a confident wrong mark that would be scored without a review flag.**

The candidate rule — a mark is a bubble scoring ≥ 0.70 **and** ≥ the row's lower-half mean + 0.22 — reads the same photo fully: roll 242478, set ক, 20 of 20 answers as visible (including two half-filled bubbles and two double-marked rows).

**Options:**
- **A (recommended):** use the adaptive rule as the reader's mark rule. qbank's rule runs alongside: where the two disagree on a row, that row is flagged for review (never scored silently). Thresholds 0.70 / +0.22 are fixed constants, covered by tests.
- **B:** use the adaptive rule only (no cross-check).
- **C:** keep qbank's rule unchanged (D127 as written); weak photos give many review flags and can give a silent wrong mark as above.

**Proposed row (option A):** `| D131 | OMR mark rule for weak photos (amends D127 "unchanged in its rules") | Owner approved (2026-10-20). The browser reader marks a bubble when its score is >= 0.70 and >= the row's lower-half mean + 0.22 (adaptive to printed labels, dim light, blur and screen photos). qbank's original rule is computed too; any row where the two rules disagree is flagged for review and never scored silently. Pre-processing (paper crop, light flattening, sharpening, alignment) stays. No server or table change. |`

# Draft decision D128 — multi-subject papers grouped by subject (owner to add; agent did not edit LOCKED-DECISIONS)

**Why needed:** D126 (2) shuffles questions only *within a section* and says nothing about subjects. D127 numbers OMR rows 1..N in the frozen set's printed order. Grouping a paper by subject — subject blocks in a chosen order, shuffling only inside a block, OMR bubbles grouped under subject headings — is a new rule that neither decision authorizes.

**What already works without a new decision:** a teacher can create one section per subject (in the order they want). Sets then shuffle only inside each section, numbering runs continuously across the paper, and OMR row n is the n-th MCQ, so the numbers on the paper and on the OMR sheet already match.

**Options:**
- **A (recommended, narrow):** "D128: A paper may hold questions from more than one subject. On request, the paper groups its questions by subject in the order the teacher picks, as subject-titled blocks inside each section. Sets shuffle questions only inside a subject block (options as in D126). Numbering stays continuous across the paper. The OMR sheet prints a subject heading over each block's bubbles, with the same numbers. Frozen sets (D126 (2)) keep this order. No new table; the subject order is stored in the paper's existing settings/layout JSON."
- **B:** No new rule. Teachers use one section per subject (this works now). The OMR sheet gets no subject headings.
- **C:** Same as A, but with no OMR subject headings (paper grouping only).

**Proposed row (for option A):** `| D128 | 2026-10-20 | Multi-subject paper: optional grouping by subject in teacher order, shuffle within subject only, continuous numbering, OMR bubbles grouped by subject with the same numbers, preserved in frozen sets; no new table | R2.1.5/R2.1.6 |`

# Question Bank Parity Audit And Remaining Plan

**Status:** audit snapshot and proposed backlog; this file does not replace the generated release plan or authorize edits to protected specifications/schema. Owner approval through the repository Change-Request process is required before adding protected tasks or data structures.

**Owner terminology decision (2026-10-13):** legacy `QuestionSet` maps to this platform's **question paper** (`qb_papers`); legacy `QuestionSetSubset` maps to a **set/variant of that question paper**. Do not design or name a separate reusable-question-set feature. A `QuestionSetFolder` is question-paper folder organization. This fixes the product mapping; it does not by itself approve schema/plan changes or settle how legacy authors/institutions are mapped during data import.

## Audit Snapshot

As of 2026-10-13, the inspected checkouts were:

| Project | Revision | State | Use in this project |
|---|---|---|---|
| School Management | `claude/elegant-cori-gw2mw5` at `5f7eade` | only the owner-kept `?? text.txt` was untracked | The only project agents may change for this work |
| Legacy question bank | `feat/occurrence-sources` at `40f769c9` | Git status clean | Read-only behavior/feature reference; never edit, stage, commit, or push here |

The source project's README is the stock Laravel README and it has no top-level `AGENTS.md` or `CLAUDE.md`; it is not an authoritative product plan. Audit findings below come from current route, model, migration, seeder, controller, view, and test-file inventories, not from old audit reports. **No source-project tests or application commands were run**: its environment/database was not established as disposable. File presence proves a feature surface exists, not that it works correctly.

## Existing Integration

`docs/PROGRESS.md` records QB.0–QB.12 as complete and QB.13/QB.14 as incomplete. The existing generated plan currently orders QB.14 before QB.13 and declares QB.13 dependent on QB.14, while the history/progress contains QB.13 implementation commits before QB.14 commits. Preserve the generated plan and commit history; do not silently reorder either. Resolve the discrepancy before deciding which incomplete task is next.

| Capability | Evidence in School Management | Audit status |
|---|---|---|
| Curriculum, platform catalogue, writers/moderators, review and revisions | QB.0–QB.2, `QbCurriculumController`, `QbQuestionController` | Present; verify full acceptance via current task tests |
| Question types, structured items, mixed parts, metadata/new-question form | QB.3–QB.4 and QB.13 parts in progress | Present in part; QB.13 remains incomplete |
| Type catalogue identifiers | Source `QuestionTypeSeeder.php` and integration `qb_question_types.json` each contain 74 unique slugs; a direct comparison found 0 source-only and 0 integration-only slugs | Slug parity confirmed at these revisions only; labels, class/subject restrictions, UI rules, and runtime behavior are not thereby proven equal |
| Search and free question browsing | `QbPurchaseController::questions` filters by subject, chapter, topic, type, difficulty, and text | Core search exists; parity with source `QuestionFinderController` relevance/filters is not audited yet |
| Concepts, resources, pricing, purchase, student portal, quizzes, writer earnings | QB.5–QB.10b entries in `docs/PROGRESS.md` | Present per progress log; this audit did not rerun those suites |
| Import from the old qbank database | QB.11 `QbImportFromQbank` | Present and idempotent for supported rows; its own command comment and implementation explicitly leave question sets, OMR, and unsupported groups out |
| Rich-text toolbar, math, pictures and tables | QB.12–QB.14; `QbRichText`, editor/ribbon, paper PDF | Partial: QB.14 is incomplete; D72 explicitly defers subject-specific diagrams, charts, and video |
| Question papers and their sets/variants | `QbPaperController`, `qb_papers`, sections/items; set A/B output | Paper workflow exists and is the target for legacy `QuestionSet`. Existing A/B printing does not prove parity with persisted/generated `QuestionSetSubset` variants, subset naming/snapshot behavior, or all source permutation strategies |
| Question-paper folders | Source `QuestionSetFolder` model/controller/routes; no corresponding `qb_*` folder table/route was found in the inspected integration inventory | Missing; include as folders that organize question papers, not as question sets |
| OMR form generation, printing, scan/camera intake, comparison, verification/results | No corresponding `qb_*` OMR tables/routes were found in the inspected integration schema/routes | Missing from inspected integration surface; source code path exists but was not runtime-validated |
| Subject-specific diagram toolbox | Integration has media/image and rich-text support; no matching diagram registry/editor family was found in the inspected QB feature inventory | Missing beyond ordinary pictures. Source has 29 live `*-registry-v1.js` families; 29 is a registry-family count, not a verified count of individual tools |
| PDF extraction/review/import | No corresponding QB PDF-extraction workflow was found in the inspected integration routes/schema | Missing from inspected integration surface |
| AI-produced JSON import/review | No corresponding QB AI-JSON intake workflow was found in the inspected integration routes/schema | Missing from inspected integration surface. This means importing prepared JSON; it does not imply adding an external AI service |

Legacy evidence includes `routes/question-finder.php`, `routes/pdf-extractor.php`, `routes/ai-json.php`, `QuestionSetController`, `OmrController`, `PdfQuestionExtractorController`, `JsonImport2Controller`, corresponding models/migrations/views, and focused import/structured-question tests. The source has 29 diagram registry families under `public/js/diagram/`. These are implementation references only; their test coverage and current behavior still need a controlled audit before porting.

## Scope And Invariants

- Port question-bank workflows and domain behavior into the existing Laravel 12 + React application. Do not copy the legacy Laravel 13/Blade application wholesale.
- Keep `E:\Projects\exam-management` read-only. Do not inspect or disclose `.env`/credentials, connect to its database, edit files, or run commands that can write there.
- Preserve the locked decisions: tenant isolation/fail-closed access (D25), immutable money ledgers (D32), question answers hidden until entitlement (D65/D66), and the exact editor/rich-text safety boundary (D72/D73).
- Discount subscriptions from the legacy source are explicitly excluded by D66. Do not add them. Legacy authentication, institution management, and unrelated school-administration features are not part of question-bank parity.
- The owner's mapping is fixed: old `QuestionSet` is a question paper and old `QuestionSetSubset` is a paper set/variant. Existing `qb_papers` are institution-owned; any legacy import must resolve the source author/institution mapping before creating target papers. Do not reintroduce a separate reusable question-set concept.
- D72 forbids new Composer/npm packages for its specified editor work. Any dependency required by later import/diagram features needs its own owner approval.
- New source-derived scope affects protected `docs/**`, schema, release plans, and guard scope. Before coding those features, the owner must record a new decision (proposed D74) and approve the generated specification/plan update with the required Change-Request trailers. This advisory plan alone is not that authorization.

## Proposed Remaining Work

The labels below are planning groups, **not official task IDs**. Once approved, convert them into the generated plan and progress ledger using the repository's guarded process. Keep one planned task per commit and push every coherent, verified checkpoint immediately to the shared Claude branch.

### Gate 0 — Reconcile And Finish In-Flight Work

1. Recheck the current branch, progress, and code; finish QB.14 and QB.13 strictly under the generated plan's current dependency/order rules.
2. Run each task's focused API/frontend/lint/build/Playwright checks and required full suite before marking it complete.
3. Record the QB.13/QB.14 plan/history discrepancy for owner resolution if the guard or generated plan makes the next step ambiguous. Never edit the generated plan or rewrite history to make the discrepancy disappear.

### Gate 1 — Owner-Signed Parity Contract

Before schema or feature implementation, approve a source-to-platform matrix that assigns every legacy question-bank feature one disposition: **port**, **not applicable with reason**, or **blocked on owner/external input**. Add an owner decision and generated tasks for the approved additions. The paper/set terminology above is decided. In particular, settle:

- how source authors and source records map to institution-owned `qb_papers` during legacy import;
- who may create/edit/finalize papers and paper sets, how variant question/option ordering and immutable snapshots work, and whether OMR results belong to an institution/student;
- which of the 29 diagram registry families are required for full parity, their stable serialized format, and how they safely render in question text/papers;
- allowed PDF intake formats/limits, where extraction runs, retention/deletion rules, manual correction/review states, and whether any external OCR/AI dependency is allowed;
- how duplicate, partial, malformed, or unreviewed legacy imports are reported and recovered.

### Gate 2 — Search And Catalogue Parity

Compare source search behavior with `QbPurchaseController::questions` (filters, matching, ordering, pagination, type/class/subject restrictions, occurrence/source filters). Compare each of the 74 exact type slugs' labels, active state, class/subject applicability, child-type relationships, editor configuration, and answer/scoring policy. Add only demonstrated gaps; keep the question/answer entitlement boundary and tenant tests intact.

### Gate 3 — Question Papers, Folders, Sets, And Import

Treat the legacy `QuestionSet` as a question paper and `QuestionSetSubset` as one of that paper's sets/variants. Reconcile the source's set generation, naming, option/question permutations, persisted snapshot and print behavior with the existing `qb_papers`/A-B output. Port `QuestionSetFolder` as folders that organize question papers. Extend QB.11 as a separate idempotent import slice after source-author-to-institution mapping is decided: dry-run counts, stable source-to-target maps, media ownership, unsupported-row reasons, retry safety, and no duplicate papers/questions/answers. QB.11's current “question sets/OMR skipped” behavior must remain explicit until the approved paper/set mapping is implemented; do not add a second standalone set catalogue.

### Gate 4 — OMR Workflow (Depends On Gate 3)

Port approved form layout/configuration, generation and print from a question paper, upload/camera scan intake, answer normalization against the selected paper set/variant, scoring/negative-mark rules, batch comparison, manual verification/correction, results/export, and scan/media retention. Prove per-institution access, duplicate/idempotent submission handling, audit history for corrections, and no cross-tenant result visibility. Inspect the legacy implementation for defects; port verified behavior, not unsafe details (for example floating-point money or unscoped queries).

### Gate 5 — Diagram And Graph Authoring (Depends On QB.14)

Inventory all 29 source registry families into a checked-in acceptance matrix, then group implementation by shared editor/rendering behavior. For every family, record create/edit/reopen/preview/save/paper-render round trips, keyboard/mobile behavior, stored data version, and invalid-payload handling. Preserve D72's media ownership and HTML allowlist rules; never execute imported SVG/HTML or trust source markup. Complete every owner-approved family before claiming full parity; no package additions without approval.

### Gate 6 — PDF Extraction And Review

Port the source PDF batch lifecycle as a separate intake workflow: validated upload and limits, extraction, question detection, selection, re-extraction/settings, metadata/source history, math/figure review, draft handoff to the existing editor, selected import, retry, rejection/discard, retention cleanup, and actionable partial-failure reports. Keep output as unpublished drafts until the existing writer/moderator review flow accepts it. Test Bengali/English, malformed/large PDFs, private media access, and no duplicate draft creation.

### Gate 7 — Prepared AI-JSON Import And Review

Port only the existing prepared-JSON import workflow unless the owner separately approves a model/API integration. Validate versioned JSON strictly; preview class/subject/type/source mappings and all warnings before import; support selected rows, dry-run, idempotency, correction, retry, and draft/review state. Never trust generated answer keys, HTML, file paths, or tenant IDs. Reuse the platform question validation and answer-leak tests.

### Gate 8 — Full Acceptance And Closure

Maintain a source-to-platform acceptance matrix with links to implementation and tests. Require role/workflow coverage, tenant isolation, answer entitlement, wallet/ledger invariants, source-map idempotency, private-file access, import failure recovery, accessibility/mobile/editor round trips, schema parity, API/unit tests, and Playwright E2E for the main writer → review → teacher → question paper → paper set → OMR/import workflows. A source feature is complete only when its agreed acceptance tests pass; file presence or a legacy report is not completion evidence.

## Next Safe Action

Do not start the new parity backlog yet. First re-fetch both repos and confirm these revisions are still current. Then resolve the in-flight QB.13/QB.14 order using the generated plan/guard and obtain the owner-approved D74 scope for features beyond it. Until then, use the legacy project only for read-only, task-specific inspection.

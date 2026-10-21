# R2.1 — generated planning plan (D83)

> PLANNING ONLY except for the explicit R2.1.2 D114-D117 dataset-lifecycle, D138-D145 language-curriculum, D142 gap-authoring, and D146 graph-tool viewport slices below. Runtime remains R3; no runtime switch is authorized.
> Generate: `py -3.14 infra/spec-verify/gen_r21_plan.py .`; check: append `--check`.
> Do not edit generated files. Source: `docs/release/r21-scope.json` and `docs/release/r21-gap-map.json`.

Placement: after R3.A, before R4/later; retain existing R1.1/R2 prerequisites.
R2.1.0 requires R3.A. Executable task/schema/API scope and the runtime-switch task require owner refinement.
R2.1.9 is proposed acceptance, not an authorized release switch. R3.A and R2.1.9 alone do not authorize switching.
The upstream qbank repository remains read-only under D109. Target-repository commands/tests are limited to an executable slice and its acceptance checks.

Existing route anchors name source declarations in the destination route file, not proposed new URLs.
The imported root proposal, including its complete feature inventory, remains the requirements catalogue.

## Approved scoped implementation slice — R2.1.2-dataset-lifecycle

Task: R2.1.2-dataset-lifecycle (parent R2.1.2); decisions: D114, D115, D116, D117.
Depends on: R2.1.1; status: executable slice, not accepted.
Scope: QbGraphDataset lifecycle only: central writer API; a writer manages only their own datasets, moderators are read-only, and Super Admin may manage all; enforce D115 size limits, stale-version conflicts and published-question in-use deletion guard.
Authorized table: qb_graph_datasets.
Routes: GET|HEAD /writer/graph-datasets (content_writer, content_moderator, super_admin); POST /writer/graph-datasets (content_writer, super_admin); GET|HEAD /writer/graph-datasets/{id} (content_writer, content_moderator, super_admin); PUT /writer/graph-datasets/{id} (content_writer, super_admin); DELETE /writer/graph-datasets/{id} (content_writer, super_admin).
Roles: content_writer, content_moderator, super_admin.
Done when: Dataset CRUD is central-host-only. Writers manage only their own datasets; moderators can read but never write; Super Admin can manage all. Enforce 50,000 rows, 80 columns, 1,000,000 cells, 2,048 characters per cell, server checksum/version, stale-version conflicts and refusal to delete a dataset referenced by a published question. Parent R2.1.2 remains unchecked; visuals, full format parity and finder are deferred.
Deferred from the parent task: full authoring-format and visual-mode parity matrix; graph/diagram editor and paper-renderer integration; question finder and calibrated ranking fixtures.
The parent R2.1.2 task remains unchecked until its complete D114 acceptance scope is passed.

## Approved scoped implementation slice — R2.1.2-language-curriculum

Task: R2.1.2-language-curriculum (parent R2.1.2); decisions: D138, D139, D144, D145.
Depends on: R2.1.2; status: executable slice, not accepted.
Scope: Versioned arbitrary-depth curriculum for Bangla 1st/2nd and English 1st/2nd papers; separate syllabus locations from question type/exam part; preserve legacy chapter/topic APIs; allow zero or multiple node links; add optional source question number, set and page/reference; Super Admin tree management and searchable writer breadcrumbs across authoring, preview, list and finder. D144/D145 add Super Admin mapping of existing versions to existing class levels, class-specific writer version lookup, legacy unmapped-version fallback, and no automatic changes to existing question/source links.
Authorized table: qb_curriculum_versions, qb_curriculum_nodes, qb_question_curriculum_nodes, qb_curriculum_version_class_level.
Routes: GET /super/qb/curriculum (super_admin); POST /super/qb/{kind} (super_admin); PUT|DELETE /super/qb/{kind}/{id} (super_admin); GET /writer/curriculum (content_writer, content_moderator, super_admin); POST|PUT /writer/questions[/{id}] (content_writer, super_admin); GET /writer/questions[/{id}] (content_writer, content_moderator, super_admin).
Roles: content_writer, content_moderator, super_admin.
Done when: Additive migrations and canonical schema parity; authorized version/node management with same-subject parent validation, arbitrary depth, cycle prevention, bilingual labels and stable ordering; searchable localized writer breadcrumbs; question create/edit/reopen/preview/list/finder round trips for zero, one and multiple curriculum links; optional source occurrence metadata round trip; version-to-class mapping validates subject/class links and rejects overlaps; writer lookup is class-specific with the approved legacy fallback; English 1st Paper remains linked to classes 6-12 and supports version mappings for 6-8, 9-10 and 11-12; existing question/source links remain unchanged; old chapter/topic endpoints and records remain compatible; bn/en, role/module/tenant, no-answer-leak, migration rollback and focused regression checks pass. Do not seed unverified textbook content. Record exact evidence in docs/PROGRESS.md.
Deferred from the parent task: textbook content seeding; R2.1 runtime switch; all unrelated R2.1 tasks.
The parent R2.1.2 task remains unchecked until its complete D114 acceptance scope is passed.

## Approved scoped implementation slice — R2.1.2-gap-fill-authoring

Task: R2.1.2-gap-fill-authoring (parent R2.1.2); decisions: D142.
Depends on: R2.1.2; status: executable slice, not accepted.
Scope: Inline structured gap authoring: one continuous question passage, cursor insertion of labeled blanks, and stable per-gap answer, hint and marks mapping through save, reopen and writer preview. Reuse question_text, qb_question_items and existing answer JSON; preserve existing question permissions, student answer isolation and all non-gap behavior.
Authorized table: .
Routes: .
Roles: content_writer, super_admin.
Done when: Supported structured gap questions create, save, reopen, edit and preview inline blanks in stable passage order; existing gap questions remain readable and editable; answer-leak, bilingual/RTL, persistence and focused editor regression checks pass. Record exact evidence in docs/PROGRESS.md.
Deferred from the parent task: R2.1 runtime switch; all unrelated R2.1 tasks.
The parent R2.1.2 task remains unchecked until its complete D114 acceptance scope is passed.

## Approved scoped implementation slice — R2.1.2-graph-tool-viewport

Task: R2.1.2-graph-tool-viewport (parent R2.1.2); decisions: D146.
Depends on: R2.1.2; status: executable slice, not accepted.
Scope: CSS-only graph-builder viewport layout: keep the builder shell visible, scroll long controls independently, bound the preview height, and tune those bounds for narrow viewports. Preserve graph logic, controls, data, APIs, rendering and qbank assets.
Authorized table: .
Routes: .
Roles: content_writer, super_admin.
Done when: The generated plan is fresh; the pinned vendor manifest exactly matches the graph tool; desktop and narrow viewports show the preview while long controls scroll independently. Record exact evidence in docs/PROGRESS.md.
Deferred from the parent task: graph behavior or API changes; R2.1 runtime switch; all unrelated R2.1 tasks.
The parent R2.1.2 task remains unchecked until its complete D114 acceptance scope is passed.

## R2.1.0 — Source/target inventory, fixtures and measured baseline

Depends on: R3.A. Status: BLOCKED / unaccepted / non-executable.
Capabilities: baseline. Gates: r3_acceptance, refined_scope, source_execution.
Canonical roles: super_admin; exact new action permissions remain unresolved.
Existing entity reuse: none required for file-only baseline.
Existing route declarations: none; no new endpoint authorized.
Unresolved contracts: Approved source execution environment and fixture IDs; Complete source route/action inventory and measured OMR/performance baseline.
Acceptance requirements: AC01.
Done when (future, not run): Approved baseline environment; observed performance/OMR results and source fixture IDs, not registry or UI presence.
Feature-specific fixture/E2E/scale command: BLOCKED pending approved refined contract and fixture registry.

## R2.1.1 — Identity, canonical membership and separate role portals

Depends on: R2.1.0. Status: BLOCKED / unaccepted / non-executable.
Capabilities: identity_and_membership, writer_moderator_portals. Gates: external_services, identity_mapping, refined_scope.
Canonical roles: super_admin, content_writer, content_moderator, admin, teacher, student, parent; exact new action permissions remain unresolved.
Existing entity reuse: api/app/Models/User.php, api/app/Models/Institution.php, api/app/Models/Student.php, api/app/Models/Enrollment.php.
Existing route declarations: api/routes/api.php::LoginController::login; api/routes/api.php::QbWriterController::store.
Unresolved contracts: Source-to-canonical account/role/member mapping and Google/OTP conflict policy; Distinct post-login portal/action permissions without parallel auth.
Acceptance requirements: AC02, AC03, AC04, AC05.
Done when (future, not run): Reviewed source-to-target identity/role/member table; session/OTP/link-conflict, assignment and linked-child isolation fixtures.; Distinct portal route/navigation E2E plus writer cannot publish, moderator cannot author/earn/withdraw and tenant cannot enter central tools.
Feature-specific fixture/E2E/scale command: BLOCKED pending approved refined contract and fixture registry.

## R2.1.2 — Curriculum, authoring formats, visuals, datasets and finder

Depends on: R2.1.1. Status: BLOCKED / unaccepted / non-executable.
Capabilities: curriculum_and_authoring, media_and_structured_content, visual_modes_and_datasets, finder. Gates: dataset_ownership, format_visual_mapping, refined_scope.
Canonical roles: super_admin, content_writer, content_moderator; exact new action permissions remain unresolved.
Existing entity reuse: api/app/Models/QbQuestion.php, api/app/Models/QbQuestionType.php, api/app/Models/QbQuestionItem.php, api/app/Models/QbQuestionRevision.php, api/app/Models/QbMedia.php.
Existing route declarations: api/routes/api.php::QbQuestionController::store; api/routes/api.php::QbQuestionController::update; api/routes/api.php::QbQuestionController::publish.
Unresolved contracts: Per-format response/editor and per-mode visual capability/version mapping; Dataset ownership, limits, stale-write and in-use delete contract; calibrated finder fixtures.
Acceptance requirements: AC06, AC07, AC08, AC09, AC14, AC15.
Done when (future, not run): Every supported format: create/save/reopen/edit/preview/export; D72-D74 layout, metadata, mixed items and safe renderer regressions.; Upload/attach/replace/remove, private-media authorization, mixed-child/stimulus/source metadata persistence and image transform fidelity.; Per-mode source editor/importer/renderer anchors and fixtures; editable CRUD/reopen/export, import/read-only preservation, stale-version/in-use deletion and ownership denial checks.; Labeled ordering/ambiguity fixtures, reviewed thresholds and locked-answer leakage checks; uncertain matches require manual selection.
Feature-specific fixture/E2E/scale command: BLOCKED pending approved refined contract and fixture registry.

## R2.1.3 — Versioned JSON/TOON staging and lossless bulk import

Depends on: R2.1.2. Status: BLOCKED / unaccepted / non-executable.
Capabilities: json_and_toon. Gates: canonical_import_scope, format_visual_mapping, refined_scope.
Canonical roles: super_admin, content_writer; exact new action permissions remain unresolved.
Existing entity reuse: api/app/Models/QbQuestion.php, api/app/Models/QbImportMap.php.
Existing route declarations: none; no new endpoint authorized.
Unresolved contracts: Canonical staged schema, version adapters, parser/dependencies, role/action permissions and selected draft persistence; Chunk size/retry/idempotency and exact decoded LaTeX/TOON validation fixtures.
Acceptance requirements: AC06, AC10, AC11.
Done when (future, not run): Versioned JSON v1/v2 and TOON examples; field-path errors; exact accepted/failed counts; valid decoded LaTeX unchanged; resumable/idempotent 10k fixture and selected draft persistence.
Feature-specific fixture/E2E/scale command: BLOCKED pending approved refined contract and fixture registry.

## R2.1.4 — PDF extraction, staged review/edit and explicit finalization

Depends on: R2.1.2. Status: BLOCKED / unaccepted / non-executable.
Capabilities: pdf_staging. Gates: canonical_import_scope, external_services, refined_scope.
Canonical roles: super_admin, content_writer; exact new action permissions remain unresolved.
Existing entity reuse: api/app/Models/QbQuestion.php, api/app/Models/QbMedia.php.
Existing route declarations: none; no new endpoint authorized.
Unresolved contracts: Extractor/OCR inputs, limits/dependencies and unreadable-page policy; Page provenance, staged schema/API, edits/reopen/duplicates/finalization permissions.
Acceptance requirements: AC10, AC12.
Done when (future, not run): Page-range, hybrid/scanned unresolved states, source-page provenance, staged edit/reopen/finalize, duplicates, LaTeX and explicit publication boundaries.
Feature-specific fixture/E2E/scale command: BLOCKED pending approved refined contract and fixture registry.

## R2.1.5 — Canonical papers, folders, variants, blueprints and print

Depends on: R2.1.2. Status: BLOCKED / unaccepted / non-executable.
Capabilities: paper_variants_and_blueprints. Gates: paper_mapping, refined_scope.
Canonical roles: admin, teacher; exact new action permissions remain unresolved.
Existing entity reuse: api/app/Models/QbPaper.php, api/app/Models/QbPaperItem.php, api/app/Models/QbPaperSection.php.
Existing route declarations: api/routes/api.php::QbPaperController::store.
Unresolved contracts: QuestionSet to qb_papers; subset to variant; folder organization and blueprint mapping; Snapshot/variant/permutation/entitlement/print contracts; no duplicate question-set entity.
Acceptance requirements: AC13.
Done when (future, not run): Folder cycles/moves, deterministic snapshots/variants/permutations, blueprint ambiguity/eligibility, marks/media/PDF/answer key and entitlement/tenant checks.
Feature-specific fixture/E2E/scale command: BLOCKED pending approved refined contract and fixture registry.

## R2.1.6 — OMR forms, scan review/comparison and canonical handoff

Depends on: R2.1.5. Status: BLOCKED / unaccepted / non-executable.
Capabilities: omr. Gates: omr_result_mapping, paper_mapping, refined_scope, source_execution.
Canonical roles: admin, teacher; exact new action permissions remain unresolved.
Existing entity reuse: api/app/Models/QbPaper.php, api/app/Models/Student.php, api/app/Models/Enrollment.php, api/app/Models/Exam.php, api/app/Models/Result.php.
Existing route declarations: none; no new endpoint authorized.
Unresolved contracts: Form/scan schema and immutable layout version; student/exam/set/identity mapping; Golden/noisy scans, manual review, duplicates, partial failure and measured capacity; no uncertain publish.
Acceptance requirements: AC16, AC17, AC18, AC19.
Done when (future, not run): Golden identity/set/answer/marks plus noise/rotation/blank/multiple/duplicate ambiguity, per-record recovery, capacity, review and publication/assignment isolation.
Feature-specific fixture/E2E/scale command: BLOCKED pending approved refined contract and fixture registry.

## R2.1.7 — Canonical exams, routines, marks and released results

Depends on: R2.1.0. Status: BLOCKED / unaccepted / non-executable.
Capabilities: exams_and_results. Gates: identity_mapping, omr_result_mapping, refined_scope.
Canonical roles: admin, teacher, student, parent; exact new action permissions remain unresolved.
Existing entity reuse: api/app/Models/Exam.php, api/app/Models/Result.php, api/app/Models/Enrollment.php.
Existing route declarations: api/routes/api.php::ExamController::publish.
Unresolved contracts: Source academic/routine/type/merit export mapping to canonical records; OMR handoff and existing grade/pass/publication/linked-child limits.
Acceptance requirements: AC05, AC20.
Done when (future, not run): Mapped canonical IDs, grade/pass/merit/export fixtures and released student/parent visibility with assignment/tenant denial tests.
Feature-specific fixture/E2E/scale command: BLOCKED pending approved refined contract and fixture registry.

## R2.1.8 — Verified legacy rights and separate financial reconciliation

Depends on: R2.1.3, R2.1.4, R2.1.5, R2.1.6, R2.1.7. Status: BLOCKED / unaccepted / non-executable.
Capabilities: financial_entitlements. Gates: financial_settlement, identity_mapping, refined_scope.
Canonical roles: super_admin, admin, student, content_writer; exact new action permissions remain unresolved.
Existing entity reuse: api/app/Models/QbStudentOrder.php, api/app/Models/QbUnlock.php, api/app/Models/QbStudentUnlock.php, api/app/Models/QbPriceRule.php, api/app/Models/QbWriterEarning.php.
Existing route declarations: api/routes/api.php::QbStudentOrderCallbackController::bkash.
Unresolved contracts: Owner settlement for unresolved paid rights/balances and verified grants; Exact-decimal append-only order/ledger reconciliation; no personal/student wallet or payment manager port.
Acceptance requirements: AC21, AC22, AC23, AC24.
Done when (future, not run): Exact-decimal append-only reconciliation, verified rights grants/idempotency, exact order reference/amount callbacks and unresolved-right/balance cutover block.
Feature-specific fixture/E2E/scale command: BLOCKED pending approved refined contract and fixture registry.

## R2.1.9 — Portal/tenancy/import/OMR acceptance and activation refinement

Depends on: R2.1.0, R2.1.1, R2.1.2, R2.1.3, R2.1.4, R2.1.5, R2.1.6, R2.1.7, R2.1.8. Status: BLOCKED / unaccepted / non-executable.
Capabilities: acceptance. Gates: r3_acceptance, refined_scope, source_execution.
Canonical roles: super_admin, content_writer, content_moderator, admin, teacher, accountant, student, parent; exact new action permissions remain unresolved.
Existing entity reuse: none required for file-only baseline.
Existing route declarations: none; no new endpoint authorized.
Unresolved contracts: Approved feature fixture/E2E/import-scale/OMR command registry and complete observed results; Explicit owner-approved runtime-switch task, module list and acceptance prerequisites; never infer activation from label.
Acceptance requirements: AC01, AC02, AC03, AC04, AC05, AC06, AC07, AC08, AC09, AC10, AC11, AC12, AC13, AC14, AC15, AC16, AC17, AC18, AC19, AC20, AC21, AC22, AC23, AC24, AC25, AC26.
Done when (future, not run): All planned tasks plus portal/tenant/security/persistence/E2E, import-scale, OMR regression and approved runtime acceptance prerequisites pass.
Feature-specific fixture/E2E/scale command: BLOCKED pending approved refined contract and fixture registry.

## Future baseline regression commands

These commands supplement future feature fixtures; none establish source parity by themselves.

- `api`: `php artisan test` — future canonical backend regression; not parity proof.
- `frontend`: `npm test -- --run` — future frontend regression; not persistence proof.
- `frontend`: `npm run lint:theme` — future theme/RTL regression; not E2E proof.

## Imported release acceptance catalogue

- **AC01**: Parity matrix covers every user-visible source feature, source role, route/workflow, data entity and import format; each is marked implemented, intentionally unsupported by source, or explicitly blocked with an owner decision.
- **AC02**: Writer and Moderator have separate post-login destinations, dashboard/navigation, route guards and API permissions. A Writer cannot publish; a Moderator cannot create/alter Writer content or access earnings; tenant users cannot access central writer tools.
- **AC03**: Registration/email OTP, login/logout, password-reset OTP, Google sign-in/link conflict handling (when configured), account activation and session behavior pass auth E2E tests using School Management's policy; no fixed/default password path is exposed.
- **AC04**: Super Admin can search/edit users, update profile/avatar/role, activate/deactivate and reset passwords; role mapping is explicit, audited and tenant/platform boundaries are enforced.
- **AC05**: Institution profile/logo, sessions, classes/sections/branches, student rosters, member invites, join requests, role changes and approve/reject/remove flows are mapped to canonical School Management records and tenant-tested.
- **AC06**: Every active source question type has a valid JSON example, schema validation, round-trip persistence/render test and import test, including options, structured children, creative parts, stimuli and supported visuals.
- **AC07**: Writer editor parity matrix covers every source metadata-driven authoring family (passage, choice, creative, short-answer, writing, primary-writing, transformation, identification, matching, information-transfer, substitution, problem-solving, visual-response, oral, practical and generic) with type-appropriate labels, builders, controls, marks/rubrics and preview. Known formats cannot silently fall back to a generic question/answer form.
- **AC08**: The source audit classifies all 32 registered diagram modes and 27 graph types against their actual editor, importer and renderer paths. Every source-editable mode can be created, edited, linked to a question/dataset where supported, previewed, saved, reopened and round-tripped without losing versioned data; import-only and read-only/render-only modes pass their corresponding fidelity and safe-render checks and are not counted as authoring parity. Every classification has a source anchor and fixture; an unclassified mode blocks visual acceptance.
- **AC09**: D72/D73/D74 editor contracts remain intact: qbank's left parts navigation + central ribbon/editor + right live preview (mobile editor/preview switch), safe HTML allowlist/React renderer, mixed child items and metadata rules. Existing ribbon, math, media, undo/redo, preview and responsive behavior must not regress while advanced builders are added.
- **AC10**: LaTeX in valid JSON is preserved byte-for-byte after JSON decoding through staging, edit, save, render and export. Invalid JSON/LaTeX is reported with a field path; valid backslashes are never corrupted by repair logic.
- **AC11**: A mixed batch of at least 10,000 valid JSON questions imports through chunked processing with correct totals and no silent record loss. Invalid records are isolated and reported; retrying a chunk does not create duplicates.
- **AC12**: PDF page-range extraction, hybrid/scanned-document handling, batch review, edit, LaTeX check, duplicate handling and explicit finalization pass end-to-end tests. Unreadable pages are visibly marked, not reported as successfully extracted.
- **AC13**: Every source paper workflow passes parity fixtures: question filters, sets/subsets, ordering, marks, totals, instructions, variants, preview, PDF/print, answer keys and rich content.
- **AC14**: The all-questions catalogue and OCR text finder return ranked, filtered results with calibrated confidence; low-confidence results require manual selection and never reveal locked answers.
- **AC15**: Graph datasets pass ownership, limit, CRUD, question attachment, stale-version conflict and delete-while-in-use tests; no cross-user or cross-tenant dataset access is possible.
- **AC16**: OMR golden fixtures produce the same expected identity, set, answer comparison, counts and marks as the source baseline. No existing valid fixture regresses.
- **AC17**: OMR robustness tests cover rotation/skew, lighting/contrast, scan resolution, blank/multiple marks, missing/invalid set code, duplicate roll and batch partial failure. Accuracy is measured against the baseline; release must demonstrate no regression and a documented improvement on the agreed noisy-scan set.
- **AC18**: Uncertain identity, set or answer detection requires manual review; no uncertain scan can silently attach to a different student or be published as a final result.
- **AC19**: OMR supports the source baseline batch capacity (up to 200 records) with per-record status and recoverable failures; any larger capacity claim is backed by a load test.
- **AC20**: Marks, grades, merit exports, Bangla/English content and parent/student visibility pass role and end-to-end tests. Students and parents cannot see unreleased results or answer keys.
- **AC21**: Tenant-isolation tests cover question-paper ownership, scans, results, wallet entries, purchases, imports and media. Cross-tenant access fails closed.
- **AC22**: Migration dry-run and execution reconcile entity counts, media references, OMR scans, verified purchase grants and monetary history separately. No source balance is merged into a School wallet; unresolved balances/paid rights block cutover pending owner decision. Reruns are idempotent and source data remains unchanged.
- **AC23**: Institution purchases use the existing QbPurchaseService, shared SMS taka balance and `qb_purchase` ledger; student orders use the existing QbStudentOrder/BkashService callback and target unlocks. No duplicate payment service or student wallet is created.
- **AC24**: Question-bank pricing uses the D66 price rules and does not add source question-type subscription discounts; SaaS subscription behavior remains governed by D47/D55. Legacy payments and balances reconcile separately, and unresolved money/access blocks cutover.
- **AC25**: Responsive UI tests cover 360px mobile and desktop, keyboard access, loading/empty/error/progress states, both applicable UI packs, English/Bangla and RTL-safe behavior.
- **AC26**: Required backend/frontend suites, module/route authorization tests, import-scale tests, OMR fixture suite and E2E tests pass before release activation.

## Planning verification

`py -3.14 infra/spec-verify/test_r21_plan.py` tests missing gates, dependency/order, approval flags, provenance and coverage.
`py -3.14 infra/spec-verify/gen_r21_plan.py . --check` rejects stale/invalid generated planning artifacts.
Full `verify.py . --deep` and staged guard are required before the protected checkpoint.
No R2.1 runtime/module switch, source-repository writes or feature acceptance are authorized.

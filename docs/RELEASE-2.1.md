# Release 2.1 — Exam Management Parity, Import and OMR

**D83 status: placement and protected planning approved; implementation and runtime activation pending.** This specification reconciles the imported proposal with current School Management evidence. It does not declare feature acceptance or authorize migrations, new endpoints/modules/packages, database writes or payment/production changes.

## Authority, placement and phase

- [D83](LOCKED-DECISIONS.md) places R2.1 after R3.A and before R4/later milestones while retaining those milestones' own dependencies and existing R1.1/R2 prerequisites. R2.1 numbering does not retroactively insert work ahead of R3.
- Executable R2.1.0 depends on R3.A acceptance. Current runtime remains R3; R3.A is incomplete in [PROGRESS](PROGRESS.md). D79/D80 and accepted R3.0 establish the R3 transition; older R1 banners and audit snapshots do not undo it.
- Before R3.A, only D83 planning/intake reconciliation is authorized. Planned features remain non-executable until owner-approved refined task/schema/API scope and prerequisites exist. A release label or planning approval cannot bypass acceptance gates.
- Locked decisions, AGENTS and guardrails retain their precedence. Source descriptions and route/model presence are evidence inputs, not permission to copy architecture or proof of functioning features.
- [Original imported proposal](../RELEASE-2.1.md) and [intake provenance](../RELEASE-2.1-INTEGRATION.md) remain intact. The full proposed scope and acceptance requirements in the original are retained as the intake catalogue; this reconciliation narrows authorization, not the recorded feature inventory. Any additional conflict with locked decisions must be logged and resolved through the owner protocol, not silently dropped.

## Current evidence and limitations

Read-only file inspection on 2026-10-15:

| Repository | Revision/state | Evidence level |
|---|---|---|
| School Management | `881eb5a9394d2efd649b08ea82ae0fd6115aa667`, current branch; pre-existing local TOON blocker preserved | Current file/route declarations and historical accepted progress; no runtime parity tests rerun in this planning slice |
| exam-management | `40f769c966c90217de654e7fad846b2ac5cfb980`, `feat/occurrence-sources`, clean | Read-only route/model/controller/service/view/test inventories; no source DB, application commands, tests or benchmarks |

[Machine-readable gap map](release/r21-gap-map.json) records anchors, observed overlap, gaps, blockers and required future evidence. It is an incomplete planning inventory, not the executable scope/plan. Its `accepted` flags remain false. Negative findings mean no matching declaration was found in the inspected surfaces, not an exhaustive proof that no implementation could exist anywhere.

Confirmed observations:

- School QB curriculum, structured content, paper, pricing/purchase/student order and writer earnings surfaces already exist. Historical QB.13/QB.14 completion supersedes the older parity backlog's incomplete snapshot; reuse those baselines and their existing contracts.
- School role menus differ for content_writer/content_moderator, and QbQuestionController denies moderator authoring. React still routes both through the shared `/writer` area. Existing permission separation is not proof of the proposed separate dashboard/destination acceptance.
- Source QmxVisualImportService declares 32 DIAGRAM_VERSIONS and 27 GRAPH_TYPES. These are static import-registry counts, not a verified editable-mode inventory. Every mode still needs editor/importer/renderer anchors and create/save/reopen/edit/export or preservation fixtures according to its actual capability.
- Source AiJsonImportService::decode checks a 20 MB input string and uses whole-payload json_decode after a repairCommonLatexBackslashes path. This does not establish streaming capacity or byte-preserved decoded LaTeX. Future adapters must preserve valid decoded strings and isolate malformed inputs; no blind repair port.
- Source PDF staging/open-editor/finalization, OCR-text finder, graph datasets and OMR controllers/routes are present. No source execution or golden outcomes were verified here; known limits in the imported draft remain compatibility candidates requiring validation.
- School release import_kinds is students only. Its generic import infrastructure and legacy QbImportFromQbank command do not authorize a new JSON/PDF/TOON intake kind.

## Proposed delivery mapping — pending refined executable plan

The imported IDs are retained; this checkpoint introduces no new executable task IDs or reordered work.

| ID | Proposed outcome | Current baseline and prerequisite to refine |
|---|---|---|
| R2.1.0 | Source/target parity inventory, fixtures, performance and OMR baseline | R3.A acceptance; source execution/benchmark authorization and test environment still unresolved |
| R2.1.1 | Role/portal, identity/user administration and institutional membership mappings | Existing auth/platform roles; define source role/account mapping and distinct portal contract before changing routes |
| R2.1.2 | Curriculum, all-format authoring, structured/media/revisions, visuals, finder and datasets | Existing QB/editor contracts; R2.1.1; per-format/mode and ownership mapping required |
| R2.1.3 | Versioned JSON adapters, staged resumable bulk import, LaTeX fidelity and proposed TOON enhancement | R2.1.2; canonical records/parser/dependency/staging/selected-save scope and 10k acceptance approved before implementation |
| R2.1.4 | PDF extraction, review, staged edit/finalization and provenance | R2.1.2; extractor/OCR handling, file limits and staged schema/API decisions pending |
| R2.1.5 | Paper folders/variants, blueprints, authoring/print/answer-key parity | R2.1.2 and canonical purchase entitlements; reuse qb_papers, define missing organization/blueprint structures |
| R2.1.6 | OMR forms/intake/comparison/review/result handoff | R2.1.5 and canonical student/exam mapping; source golden baseline, ambiguity/duplicate and publication contracts pending |
| R2.1.7 | Exam/routine/type breakdown, marks/merit/export and released-result visibility | Existing canonical exams/enrollments/results; preserve School grade/pass/publish policy and map any OMR handoff |
| R2.1.8 | Source paid-right/order/financial reconciliation and owner-approved target grants | R2.1.3–R2.1.7; unresolved identity/payment/balance settlement blocks cutover |
| R2.1.9 | Portal E2E, tenancy/security, import-scale/OMR regression and acceptance | All preceding tasks; exact runtime-switch task and prerequisite gates still require refined plan |

No task above is accepted or executable under this planning checkpoint. The next scope/generation slice must define exact existing/new entities, routes, roles, command/fixture IDs and blocked dependencies without inventing unresolved schema or converting proposal numbers to observed results.

## Canonical integration boundaries

- Platform catalogue/writer/moderator content remains central-owned; institution papers/exams/results/purchases/scans are tenant-scoped and must fail closed. Student/parent views retain their own-account/linked-child and publication limits. New workflows must use existing canonical identities rather than parallel auth, student or result records.
- Source QuestionSet maps to destination question paper (`qb_papers`); subset maps to paper variant; folders organize papers. Source terminology does not authorize a duplicate reusable-question-set entity. Existing QB rich-content, metadata and mixed child-item contracts remain the baseline; React/AppShell/theme/UI-pack/i18n/RTL conventions remain authoritative.
- Reuse School price rules, institution purchase wallet/ledger, student order verification and writer earning/manual payout flows. Do not port personal/student wallets, source payment manager or question-type subscription discounts. D32 exact-decimal append-only history and D47 pricing remain intact. Unresolved balances or paid access rights block cutover pending owner settlement.
- TOON is a destination enhancement, not source parity or an active import kind. Its canonical encoding/parser, staging/quick-edit/selected persistence, roles and acceptance remain unresolved until approved refined scope. D83 does not resolve or authorize the existing TOON implementation blocker.
- Every accepted source format/mode retains its data meaning. Unknown/unsupported staged payloads must be reported and retained according to approved contracts. Import/render success alone is not editability; screenshots/UI presence alone are not persistence proof.
- Source repositories stay read-only. Planning grants no source DB access, writes, test execution or performance/OMR benchmarking. Future measured baselines need an explicitly authorized environment; secrets are neither requested nor published in planning artifacts.

## Open gates and acceptance evidence

The imported proposal's complete release acceptance checklist remains the requirements catalogue. This checkpoint records no passed feature acceptance. Gate IDs and dependent mapping are in r21-gap-map.json:

- R3.A and refined plan/runtime-switch acceptance; release generator/verifier/guard support must enforce dependencies while preserving existing checks.
- Source/target identity and institution membership mapping; portal role ownership and Google linking inputs.
- Format/visual contract classification, dataset ownership/limits and source-backed round-trip fixtures.
- Canonical JSON/TOON/staging/PDF schema and API scope; parser/extractor/OCR policy; exact LaTeX and idempotent/resumable 10k checks.
- Paper/variant/blueprint mapping, OMR golden/noisy-scan baselines, review/capacity and canonical result/publication handoff.
- Exact financial/entitlement reconciliation and explicit settlement for unresolved legacy balances/rights.

This planning slice is verified by anchor/task/gate checks, unchanged source/draft/local-data evidence, current plan freshness, query-plan check, full deep verifier and staged guard. It does not substitute these checks for eventual runtime, persistence, scale, OMR or portal E2E acceptance. D83 planning remains incomplete until the scope/generated plan and instruction/roadmap/tooling alignment also satisfy their approved Done When.

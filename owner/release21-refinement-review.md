# R2.1 refinement inputs — owner review packet

Prepared 2026-10-15 under D83. **Planning/evidence is reviewable; executable feature scope remains incomplete and unapproved.** This packet records inputs required on the owner's return. It is not a locked decision, approval request sent elsewhere, permission to execute source code, or a runtime activation.

## Verified planning checkpoints

- `172fb20`: [scope](../docs/release/r21-scope.json), [generated plan](../docs/AGENT-PLAN-R2.1.md), deterministic generator/validation and D83 guard enforcement. Ten tasks remain blocked/non-executable, with all 14 capabilities, 11 open gates and 26 imported release acceptance requirements mapped.
- `0f172b4`: [static audit](../docs/release/r21-static-audit.md) and [source inventory](../docs/release/r21-static-inventory.json). Source remained clean at `40f769c966c90217de654e7fad846b2ac5cfb980`; no source DB, application/seeder/test/benchmark execution.
- Both protected checkpoints passed full deep verification with exit 0 and three existing warnings. Planning mutation/freshness tests: 17; guard self-tests: 62/62; UNIQUE proof: 11/11; query-plan: 71/0. Schema parity: 133/0 in the scope checkpoint. These are planning/tooling checks, not application parity or persistence acceptance.

Current runtime remains R3 with its exact module list. Placement remains R3.A → R2.1 → R4/later, retaining existing R1.1/R2 and milestone dependencies. The root imported draft and provenance remain intact. R3.3 has not been started by this work.

## Inputs and contracts still required

| Open gate | Required input or reviewed contract | Affected tasks |
|---|---|---|
| r3_acceptance | Actual R3.A acceptance evidence in progress; planning cannot substitute for unfinished R3 work | R2.1.0 and all dependent execution |
| refined_scope | Explicit executable task/schema/API/action-permission scope, fixture IDs, exact feature commands and a separately defined runtime-switch task/module list | All ten tasks |
| source_execution | Identify and explicitly authorize a suitable fixture/baseline environment and permitted operations; the reference checkout remains read-only | Baseline, OMR and final regression |
| identity_mapping | Source users/roles/membership to canonical records, duplicate/conflicting identities and role-specific portal actions | R2.1.1, R2.1.7, R2.1.8 |
| external_services | Google-link conflict behavior and OCR/extraction handling/dependency inputs; no credentials are requested here | Identity and PDF |
| format_visual_mapping | Per-format response/editor semantics and per-mode importer/editor/renderer/persistence fixtures; resolve duplicate application meanings | R2.1.2 and dependent import/print workflows |
| dataset_ownership | Central/user/tenant/guest ownership, attachment/version/limits and delete-while-in-use policy | R2.1.2 |
| canonical_import_scope | Versioned JSON/TOON/PDF canonical/staged records, parser/dependencies, resumability/idempotency, selected draft save and role permissions | R2.1.3, R2.1.4 |
| paper_mapping | QuestionSet → qb_papers, subset → variant, folder organization/blueprint/snapshot/print contracts without duplicate entities | R2.1.5, R2.1.6 |
| omr_result_mapping | Golden/noisy-scan fixture set, canonical student/exam/set identity, uncertainty/manual review, duplicate/partial failure, capacity and result publication | R2.1.6, R2.1.7 |
| financial_settlement | Owner disposition of unresolved legacy paid rights/balances; exact-decimal separate reconciliation and verified idempotent grants | R2.1.8 and cutover |

Source execution authorization, a reviewed fixture set and executable schema/API approval are separate from D83 planning. Missing source measurements are not zero measurements or accepted baselines. The generated plan's feature-specific command fields remain null rather than naming tests that do not exist.

## Evidence requiring particular care

1. The source seeder contains 75 literal declarations / 74 unique slugs. `application` appears at lines 273 and 969 with cognitive and formal-writing meanings. This is not the active persisted type count. Mapping must preserve response meaning and respect metadata/interaction/format precedence; slug alone is insufficient.
2. Importer membership is 32 diagram modes / 27 graph types. The initial launcher has 37 planned literals, while the lazy loader declares 41 modules / 43 modes. Eleven lazy mode names are outside the diagram importer lookup. These are distinct static layers, not editable-feature counts. Per-mode classification and round trips remain unresolved.
3. TOON is a destination enhancement and its existing user blocker remains open. Planning does not select a parser/package or approve staged schema/quick-edit/selected persistence.
4. Existing School auth, canonical students/exams/results, safe QB content/editor contracts, institution purchase ledger, student verified orders, pricing and writer earnings remain authoritative. No source personal/student wallet, source payment manager or question-type subscription discount is being ported.
5. R2.1.9 represents proposed acceptance; it is not a runtime-switch authorization. Even completed R3.A/R2.1.9 checkboxes cannot replace the explicit owner-approved switch contract.

## Safe continuation

On return, review this packet with [the gap map](../docs/release/r21-gap-map.json), [reconciled specification](../docs/RELEASE-2.1.md) and generated plan. Resolve inputs through the existing owner decision protocol when executable scope, schema/API or protected acceptance contracts change. Preserve the approved placement and current task order; do not start R2.1.0 before R3.A or switch to unrelated implementation simply because the owner is unavailable.

For the next agent: read AGENTS/current handoff/locked decisions, fetch and compare the existing branch, preserve the unstaged user change in docs/BLOCKED.md and existing untracked files, and verify exact source revision before any further read-only inspection. Do not re-run source code to fill these gaps without the distinct authorization/environment described above. No feature is marked complete in this packet.

# Release 2.1 draft integration record

Status: imported proposal for owner review. Release placement, task activation and implementation remain pending. Importing this document is not acceptance of its feature claims or approval of its proposed tasks.

## Imported artifact

- Document: [RELEASE-2.1.md](RELEASE-2.1.md), copied byte-for-byte from `E:\Projects\SMS\RELEASE-2.1.md` on 2026-10-15 at the owner's request.
- SHA-256: `872d9ec3515fca3fd350f6210b496cb1b87ad21e840bf42bb7e9538e0f55dc54`.
- Destination baseline: School Management branch `claude/elegant-cori-gw2mw5`, commit `75705a9` (completed R3.2).
- The source's historical snapshots, route/model inventories, counts, capacities and editor/OMR classifications remain proposals or audit claims requiring current source evidence. This intake does not verify source functionality, persistence, OMR accuracy or performance.

## Authority and relationship to current work

1. [Locked decisions](docs/LOCKED-DECISIONS.md), [AGENTS.md](AGENTS.md) and [guardrails](docs/ops/agent-guardrails.md) retain their existing precedence. This imported root-level draft does not replace protected release specifications or generated plans.
2. [Release 3](docs/RELEASE-3.md), [generated R3 plan](docs/AGENT-PLAN-R3.md), [R3 scope](docs/release/r3-scope.json) and `api/config/release.php` remain the active release contract. D79/D80 and accepted R3.0 establish the current R3 transition; historical R1 banners or source snapshots do not undo that approved transition.
3. [Progress](docs/PROGRESS.md) records completed R3.2 and the next planned task R3.3. `R2.1.*` identifiers in the imported draft are proposed identifiers; this intake does not insert them into the active dependency order or mark any parity task complete.
4. [Question-bank parity backlog](QUESTION-BANK-PARITY-PLAN.md) remains the related audit/backlog. Its owner terminology mapping applies: source QuestionSet = destination question paper (`qb_papers`), source subset = paper set/variant, and folders organize papers. Imported source names do not authorize duplicate models or a separate reusable-question-set feature.
5. D65–D74 and subsequent locked decisions retain catalogue, portal, pricing, authoring, safe-content and tenancy rules. Any overlapping proposal needs reconciliation with existing implemented QB work rather than duplicate implementations. Source-to-target user roles, visual editability and ownership, financial entitlements and OMR/result mappings need evidence and explicit decisions where unresolved.
6. TOON is a proposed destination enhancement, not source parity or an active import kind. Existing student-import and QB behavior stays governed by its current scope. The pre-existing local TOON blocker in `docs/BLOCKED.md` is preserved separately and is not included in this import commit.

## Next safe activation steps

- Owner selects release identity/placement and dependency order, then records the required separate locked-decision commit under guardrails section 4.
- Reconcile the imported proposal with current QB code, this repository's decisions and the parity backlog using read-only source inventories; record missing/blocked features and evidence without assuming registry membership means editability or a visible UI means persistence.
- Under the approved Change-Request, refine protected release/scope/generated tasks and schema/API changes before dependent implementation. Resolve identity, financial, external-service and OMR baseline blockers for their dependent tasks. No credentials are needed for document intake.
- Implementation then follows the approved plan, one task at a time, with focused/full checks and checkpoint pushes. Source repositories remain read-only unless separately authorized.

## Intake verification

Source and destination hashes match exactly. This checkpoint changes only the imported draft, this integration record and its progress/handoff evidence. Active release configuration, generated plans, schema, application code, tests and existing local blocker changes remain intact. Verification passed: 9 integration links resolve, the pre-existing blocker hash is unchanged, active plan/code changes are absent, R3 generation is fresh, query-plan check reports 71/0, staged guard reports 0 failures/0 warnings and git diff --cached --check is clean.

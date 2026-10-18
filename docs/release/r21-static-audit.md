# D83 static source catalogue — planning evidence

Inspected 2026-10-15, source `E:\Projects\exam-management` at clean revision `40f769c966c90217de654e7fad846b2ac5cfb980`. Destination planning checkpoint: `172fb20`. This is D83 read-only file reconciliation, not execution or acceptance of R2.1.0. Source DB, seeders, PHP/application commands, tests and benchmarks were not run. No new feature scope is approved here.

The companion `docs/release/r21-static-inventory.json` retains each declaration, exact source line anchors, candidate editor/plugin references, and SHA-256 hashes for 62 source files. It complements `docs/release/r21-gap-map.json`; it does not replace the full imported proposal or resolve any gate.

| Static layer | Observed count | What it establishes |
|---|---:|---|
| QuestionTypeSeeder top-level question-type declarations | 75 | Literal seed entries, including one duplicated slug |
| Unique seed slugs | 74 | Distinct identifiers in that file, not active database types |
| QmxVisualImportService DIAGRAM_VERSIONS | 32 | Import mode/version lookup membership |
| QmxVisualImportService GRAPH_TYPES | 27 | Import graph-type allowlist membership |
| Initial diagram launcher tools | 37 | Base registry declarations, all literally labelled planned |
| Diagram lazy-loader modules | 41 | Module descriptors pointing to existing candidate editor files |
| Lazy-loader mode declarations | 43 | Mode names in those descriptors; aliases are recorded separately |

These layers are not interchangeable counts of editable formats. No per-mode create/save/reopen/edit/export result was observed. A planned label or file/module declaration cannot prove either working support or lack of support at runtime. Graph plugins can register IDs dynamically; absence from the inventory's literal `id:` candidates is not proof that a plugin is missing.

## Identity collision that must be resolved before mapping

`database/seeders/QuestionTypeSeeder.php` declares `application` twice:

- Line 273: **Application Question**, cognitive application; Bangla name দক্ষতামূলক প্রশ্ন.
- Line 969: **Application**, formal writing; Bangla name দরখাস্ত.

The seed loop keys updateOrCreate by slug. This is a static collision/possible overwrite risk if the seeder runs, not a finding about persisted source records. Do not collapse these meanings into one destination authoring family, silently rename source data, or infer the stored contract from either entry. Source account/type mapping needs an owner-reviewed canonical mapping and authorized source evidence before migration.

`app/Services/QuestionAuthoringProfile.php` explicitly handles this semantic collision using names and returns AMBIGUOUS_REVIEW_REQUIRED when unresolved. Its classification first considers persisted interaction/contract, flow/visible/required fields and format family; explicit authoring metadata and semantic fallback follow. `app/Models/QuestionType.php::resolvedAuthoringContract` also merges model/default and explicit metadata. The inventory preserves raw declared metadata and keeps `resolved_contract` null; no slug-based response-shape classification is applied.

## Visual coverage gap between static registries

The lazy-loader mode set includes eleven names outside DIAGRAM_VERSIONS:

`astronomy-diagram`, `block-diagram`, `disaster-management-diagram`, `ecology-diagram`, `environmental-science-diagram`, `genetics-diagram`, `geology-diagram`, `hydrology-diagram`, `oceanography-diagram`, `plant-anatomy`, `weather-climate-diagram`.

This is a registry coverage difference, not eleven accepted features or eleven import-only modes. All 32 importer diagram names have a candidate lazy-loader module in this snapshot. Module script existence is checked; invocation, payload version, rendering and persistence behavior are unverified. Import versions are literal contracts, not ordinal mode counts; do not renumber them or fill numerical gaps.

Base launcher entries, extension registries, lazy-loader descriptors, importer contracts and renderer/editor paths need one reviewed capability matrix. Each mode must eventually be classified from actual paths/fixtures as source-editable, import-only, render-only or unsupported, with unknowns blocking acceptance. Base planned labels may be changed by later scripts; this audit does not execute that loading sequence.

## Gates retained for later refinement

- Source question-type and identity mapping must account for duplicate slugs, defaults, explicit metadata, persisted interactions and format overrides. Literal seeder declarations do not enumerate active persisted types.
- format_visual_mapping remains open: all rows retain unresolved capability and false round-trip verification. Existing D72-D74 destination editor contracts remain authoritative.
- canonical_import_scope remains open: importer/loader differences do not authorize new JSON/TOON/PDF schema, parser, endpoint, package or import kind.
- dataset_ownership, source_execution and refined_scope remain open. Candidate assets do not resolve ownership/version limits or authorize source execution.
- R3.A still precedes executable R2.1.0. Runtime remains R3; no new application object or feature checkoff is introduced.

## Reproduction and verification evidence

Plain Python file parsing extracted the seeder's top-level literal row blocks, DIAGRAM_VERSIONS/GRAPH_TYPES, JSON-literal base tools and JSON-literal lazy MODULES. It did not evaluate PHP/JavaScript or apply source defaults. Literal graph plugin ID occurrences are candidates only. Exact extraction command used from the destination: `py -3.14 %TEMP%/school-r21-static-audit.py`; the temporary script wrote only the destination JSON inventory and read source files plus git status/revision.

Focused checks compare every row/set/count with those source declarations, verify 62 file hashes and candidate paths, preserve the two distinct application declarations, and confirm the source tree remains clean. The imported root draft and user blocker hash must also remain unchanged. Full deep verification, generated-plan freshness and staged D83 guard are required before checkpoint push. These checks establish static inventory integrity, not source runtime behavior or destination parity.

# Draft Decision D183: repair the existing deep-verification baseline without changing runtime behavior

> Owner review draft only. It does not change `docs/LOCKED-DECISIONS.md`, schema, verifier, generated plans or application code. A human owner must review this scope and add an approved row to the locked registry in a separate commit before protected changes begin.

## 1. Observed blockers (2026-10-28)

- `schema.sql` contains `FOREIGN KEY (qb_exam_batch_id)` on `qb_chapter_class_level`, `qb_question_class_level` and `qb_curriculum_version_class_level`, although none of those tables declares that column and the corresponding migrations do not add it. D165's real `qb_exam_batch_id` relations belong to student purchase/profile data.
- `docs/database/migrations.md` and the operational table grouping in `docs/DATABASE.md` omit existing deployed tables/migrations reported by `verify.py --deep`.
- The deep UNIQUE check flags three one-to-one foreign-key identity constraints: `exam_mark_submissions.exam_subject_id`, `ai_reviews.ai_message_id`, and `learner_profiles.user_id`. These need an explicit owner-reviewed classification and focused tests; no generic verifier bypass is proposed.
- `docs/AGENT-PLAN-R1.md` has a stale `qb_student_unlocks` global-UNIQUE expectation; current `schema.sql` and D165 behavior permit a later purchase after an earlier unlock expires.
- `plan_check.py` and tenant-export schema loading stop at the malformed foreign keys above. No production or application database was accessed.
- `php artisan test --filter=QbAllQuestionsFilterTest` cannot reach assertions: MySQL at `127.0.0.1:3307` denies user `edu` access to `edu_saas_test` (SQLSTATE 1044). No credentials were read or changed.

## 2. Proposed scope

1. Under Change-Request D183, correct only the three schema-only foreign-key declarations listed above so `schema.sql` matches the existing columns and migrations. Retain the valid D165 `qb_exam_batch_id` relationships on `qb_student_unlocks`, `qb_student_scope_access` and `learner_profiles`; do not edit or replace any migration.
2. Reconcile `docs/database/migrations.md` and `docs/DATABASE.md` operational grouping with the existing migration files and schema. This is an inventory correction only; no migration is created or modified.
3. Reconcile the R1 source scope and regenerate `docs/AGENT-PLAN-R1.md` so the `qb_student_unlocks` uniqueness entry matches the D165-approved expired-purchase behavior and canonical schema. Do not hand-edit generated output.
4. Refine the deep verifier's D12 check only for the three exact one-to-one foreign-key UNIQUE constraints named above. Each exception must verify the corresponding FK/parent identity and receive mutation tests; all other tenant-table global UNIQUE constraints remain rejected. Do not weaken or skip any existing test/check.
5. Keep `api/config/release.php` at R3; do not change D182 QBO task scope, R2.1 activation, runtime routes, features, packages or application behavior.
6. Done when schema translation creates all declared tables, migrations/docs inventory is exact, R1 generation is fresh, the schema-copy parity and hot-query checks pass, verifier/guard mutation tests pass, and the full deep verifier has no failures. Record each exact command and result. Any remaining failure stays blocked and is not waived.

## 3. Test database prerequisite (owner operation, not a code change)

The owner or database administrator must grant the configured `edu` account the required privileges on the disposable `edu_saas_test` database only, using the authorized MySQL administrator account. Do not change production grants or expose passwords. Then rerun the focused API test and full API suite serially.

## 4. Proposed locked-decision row

| D183 | Repair the existing deep-verification baseline and isolated test gate | Owner approved (date). (1) Authorize only the schema FK correction, migration/DATABASE inventory reconciliation, R1 source-plan correction/regeneration, and narrowly tested D12 classification of the three named one-to-one FK UNIQUE constraints. (2) Preserve every migration, runtime release, task status, D32/D165 purchase behavior, all unrelated uniqueness checks and all existing test assertions. (3) No R2.1 runtime/feature scope, application feature, route, package, production/database operation or data change is authorized. (4) Require focused schema/migration/parity/query/guard checks and a full deep verifier with no failures; no check may be skipped or weakened. Changes carry `Change-Request: D183`. |

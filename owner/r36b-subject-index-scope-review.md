# R3.6b subject index: owner scope review

2026-10-16. Evidence base: f2379da. Owner subsequently finalized the narrow proposal below. No runtime grant or canonical decision change; prepared D92 row is in owner/decision-D92-subject-index.md and awaits the separate owner-directed decision checkpoint.

## Current boundary

The approved matrix entry for GET|HEAD api/v1/subjects selects exactly `staff.subject.index`, with no captured module gate. `api/routes/api.php` still places this route in the admin group; StaffIdentityBoundary does not allow it. SubjectController::index validates nullable integer program_id, queries tenant subjects, and returns SubjectResource. Its current resource includes marks, optional status and teacher identity; it has no staff ownership predicate. D90 requires linked Teacher/batch/subject constraints, while D91 requires fresh selected-department authorization. Neither specifies how the assignment sources below combine for this route.

## Source evidence

| Source | Current evidence | Unresolved implication for staff subject reads |
|---|---|---|
| subjects.teacher_id | SubjectRequest/controller permit an explicit teacher pointer. ExamService::batchesFor returns null (every batch of the exam) for that teacher. | Importing this exam-specific privilege into a catalog would broaden the first staff read. |
| batch_teachers, subject_id > 0 | AcademicStructureService::syncSubjectTeachers validates subject/program consistency. DepartmentAcademicReadService already requires an actual same-program subject for the subject-assignment batch branch. | Narrow, actively maintained explicit assignment candidate. |
| batch_teachers, subject_id = 0 | Canonical schema documents all subjects of the batch; AcademicStructureApiTest accepts this sentinel. Legacy batchesOf accepts any assignment, but ExamService matches exact subject IDs without expanding zero. | Consumers differ; expansion into catalog subjects needs an explicit policy. |
| teacher_subjects | Model/schema exist, including program and optional batch. Application search finds model, deletion and tenant purge references, but no operational authorization reader or assignment writer. | Row existence alone does not prove reviewed mapping or consistent subject/program/batch ownership. |

Class-teacher ownership (batches.teacher_id) is another batch relationship; it does not by itself resolve subject catalog ownership. This audit changes none of these sources or legacy consumers.

## Proposed smallest first integration (not approved)

Require D91 selected context and exact staff.subject.index, plus the fresh active unambiguous own Teacher identity. Return only subjects explicitly assigned through specific nonzero batch_teachers rows for that Teacher, in own-tenant upcoming/running batches, with subject.program_id equal to batch.program_id. Deduplicate subjects. A program_id filter may only narrow this set.

For this first integration, direct subjects.teacher_id, zero sentinel, teacher_subjects and class-teacher ownership alone do not create a grant. Preserve their data and legacy behavior; any later expansion requires separate review. Return only subject id/name and program id/name; preserve the existing admin response. No write/detail/export/student access, new schema, endpoint, UI, tenant switch or mapping conversion is included.

## Required implementation proof after approval

Positive own specific assignments across institution types; exact-key and selected-department separation; malformed/foreign/expired/revoked context; inactive or ambiguous Teacher; assignment revocation; foreign and wrong-program rows; zero/direct-pointer/teacher_subjects/class-only non-grants; duplicate suppression; narrowing program filter; unrelated role and write-route boundaries. Keep all existing assertions intact. Focused tests precede full API/frontend/theme and required spec/guard checks. R3.6b stays incomplete until all acceptance gates pass.

## Owner decision needed

Approve the proposed narrow first integration or specify which additional sources should grant access and their consistency rules. AGENTS working rules 2/3 and G16 require making this route-specific gap explicit. If finalized as a protected contract refinement, guardrails section 4 requires a separate owner-directed decision checkpoint before canonical or runtime implementation.

## Audit verification

`php artisan test --filter='AcademicStructureApiTest|DepartmentRouteInventoryTest'` from api: 10 passed, 2751 assertions. This proves existing behavior/catalog checks only, not the proposed staff subject integration. No runtime source, existing test, schema, matrix or canonical spec was edited in this audit.

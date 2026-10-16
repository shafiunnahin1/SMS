# R3.6b subject show: bounded scope review

2026-10-16; code evidence base 8a84cdf. Owner subsequently finalized the proposed scope and explicitly directed the prepared D93 row separate commit/push. Audit checkpoint first; no runtime change.

## Evidence and unresolved boundary

- docs/department-permission-contract.json captures GET|HEAD api/v1/subjects/{id}, SubjectController@show, exact staff.subject.show, admin legacy role and no module/feature gate. It does not specify fields or assignment-source precedence for this detail read.
- api/routes/api.php still nests show in role:admin with whereNumber(id). StaffIdentityBoundary has no show exception. Existing DepartmentAuthorizationTest explicitly denies GET subjects/999999 with only staff.subject.index.
- SubjectController::show loads a tenant-scoped Subject and program/teacher relations without a staff ownership predicate. SubjectResource exposes id, program_id, program id/name, name, code, full_marks, pass_marks, is_optional, teacher_id and teacher id/name. Reusing it for staff would expose fields beyond the accepted minimal list response.
- D92 and docs/architecture/staff-account-contract.md section D92 deliberately authorize the first index only and expressly grant no detail access. Thus list ownership and key cannot silently authorize show. D91 still applies to any future business request.
- DepartmentAcademicReadService::listSubjects now has the reviewed narrow source: explicit nonzero BatchTeacher subject assignment for fresh active own Teacher, own-tenant upcoming/running batch, matching subject/batch program. Direct Subject.teacher_id, zero sentinel, TeacherSubject and class ownership alone do not grant this list read. Existing data and legacy consumers remain intact.

## Proposed smallest show integration (owner review required)

For the existing GET|HEAD subject show route, require D91 selected-department checks and independently exact staff.subject.show, plus fresh active unambiguous own Teacher. Restrict the path-bound subject to the same narrow explicit assignment predicate as D92; no source expansion. Return only subject id/name and program id/name, preserving the admin response. The index key alone cannot show a subject, and the show key alone cannot list subjects.

Return 403 for invalid selected context, missing exact duty or invalid own Teacher; return 404 for a valid authorized context whose path subject is foreign, nonexistent or outside the own assignment set. Query/body IDs cannot replace the path ID or ownership. Preserve numeric path constraint, all existing module/security boundaries, legacy behavior and default-deny for other actions. No writes, marks/teacher identity disclosure, export/student access, mapping, tenant switch, schema, new endpoint or UI is included.

## Focused falsification checks after owner approval

Across all four institution types prove exact minimal response and GET/HEAD for a real explicit assignment; independent index/show keys; foreign/nonexistent/unassigned/wrong-program/zero/direct-pointer/TeacherSubject/class-only/historical subject denial; same-token assignment loss and batch status change; selected department separation, expiry/revocation/archive; malformed headers and missing/inactive/ambiguous Teacher; impersonation and write/student-route denial. Keep every existing assertion intact and retain index-only show denial. Then run required API/frontend/theme/spec/guard gates. No task completion follows until all R3.6b acceptance work passes.

## Decision gate

AGENTS working rules 2/3 and G16 prohibit silently expanding the accepted index contract. A proposed exact D93 row is prepared in owner/decision-D93-subject-show.md for review. If the owner finalizes it and explicitly directs the separate decision commit/push, guardrails section 4 can be satisfied before protected canonical refinement and runtime integration. Until then this route remains closed to institution_staff.

Owner decision follow-up: exact D93 row registered separately in 8cf6f8f and pushed by explicit owner direction. The registry checkpoint precedes this audit evidence checkpoint because quick spec rejects references to an unregistered decision. No canonical or runtime implementation occurred.

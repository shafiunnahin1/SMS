# R3.6b teacher index scope review

2026-10-16. Evidence base 8e3bb05. Audit only; no runtime grant or finalized policy in this packet.

## Current evidence

The approved route matrix captures GET|HEAD api/v1/teachers, TeacherController@index, exact staff.teacher.index, legacy admin role and no module/feature gate. The resource scope is generic tenant plus existing ownership constraints, not an institution-wide staff directory contract. The route remains in role:admin; StaffIdentityBoundary has no teacher-index exception.

TeacherController::index validates q (nullable string, max50) and status (active/inactive/on_leave). The tenant-scoped query eagerly loads user id/name/phone/email, searches employee_id prefix or user name/phone substring, optionally filters status, and orders employee_id. It has no staff ownership predicate. TeacherResource exposes id, user_id, name, phone, email, employee_id, designation, department, joining_date, qualification and status. Salary/allowances are already excluded under D33; this does not define staff access to the remaining fields.

Teacher uses tenant scope and soft deletion. The staff account contract preserves HR-owned employment fields and historical profiles, permits one Teacher plus one StaffMember, rejects ambiguous same-type links, and says legacy department strings grant nothing. Neither a legacy department string nor sharing academic batches proves a reviewed directory grant. No profile should be created to satisfy a read.

## Proposed smallest first staff integration (owner review required)

Require D91 selected-department authorization, independently exact staff.teacher.index and a fresh active unambiguous own Teacher linked by user_id. Return a collection containing only that own Teacher's id and current linked User.name. No other Teacher is included. Missing/inactive/ambiguous own Teacher or invalid context/key is403. Preserve current admin response/query behavior.

For staff, q retains nullable string/max50 validation but searches only the own linked user name; do not search hidden phone or employee_id. Retain the existing status validation values, but apply status only as a narrowing filter on the own active row: inactive/on_leave yields an empty collection. Arbitrary actor/user/teacher/department/program inputs cannot broaden scope. No implicit membership, role fallback, department-text mapping, shared-batch directory or cached grant.

Exclude phone/email, employee_id, user_id, designation, legacy department, employment dates, qualification, status, salary and allowances from the first staff response. No detail/write/export/payroll/student access, mapping, tenant switch, schema, new endpoint or UI is included. Any directory or field expansion requires separate owner review.

## Required implementation falsification checks after approval

Across four institution types prove own-only exact id/name response and GET/HEAD; own name search/status narrowing; hidden phone/employee-id search cannot return the row; other-user/foreign/department query overrides cannot broaden; independent index versus teacher-show/other keys; missing/inactive/soft-deleted/ambiguous Teacher and invalid context; selected-department separation and same-token membership/duty/account/profile revocation; impersonation; unchanged admin shape and other-action boundaries. Preserve every existing test/assertion, then required full API/frontend/theme/spec/guard checks. R3.6b remains incomplete until all acceptance gates pass.

## Decision gate

Owner must finalize own-only minimal first read or specify a different reviewed record/field/search scope. AGENTS working rules2/3 and G16 prohibit silently inventing the directory policy. A finalized protected refinement requires a separate owner-directed registry checkpoint under docs/ops/agent-guardrails.md section4 before canonical/runtime work. No runtime opening follows from this audit alone.

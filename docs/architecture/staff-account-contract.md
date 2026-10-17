# D90 — Staff account, onboarding and department authorization contract

Owner approved all six clauses and the complete matrix preserved in commit d7d9a23; decision registry checkpoint ff8547b. This document is the canonical execution contract. Source DDL is only `docs/database/schema.sql`. Approved action/resource rules are in `docs/department-permission-contract.json`. None of this is runtime or browser verification.

## Scope and order

R3.6a owns six tables: institution_registrations, account_activation_requests and the four department/membership/duty tables. Its twenty planned routes include the three approved activation/resend additions. Existing POST /super/institutions is an integration point, not a duplicate new route. Preserve R3.6a → R3.6b → R3.7; UI/portals remain R3.12. No implicit department, duty, subscription, trial, billing or module grant. Canonical-contract checkpoint precedes runtime implementation; no app/demo DB migration or live message/payment is authorized by this checkpoint.

## Registration and activation invariants

- Public signup creates an inactive institution and inactive first-principal User. Contact proof alone does not activate either; explicit central Super Admin approval is also required. No pending tenant access or token issuance.
- Super Admin provisioning records its actor's approval, but recipient contact verification and recipient-owned password setup still precede institution/account activation. No reusable principal/staff password is returned or displayed to its creator.
- institutions.status=inactive and users.is_active=false represent pending state. Do not change existing rows automatically. Unique institution_registrations.institution_id and an institution transaction lock prevent duplicate first-principal provisioning; composite first-admin/user references reject foreign tenant identities.
- Registration source is public or super_admin; review_status is pending/approved/rejected. Only the service may assign reviewer/approval fields. Reviewer must be an active central Super Admin; SQL FK existence does not prove reviewer role.
- Activation purpose is principal_activation/staff_activation/contact_change; channel is phone/email; status is pending/verified/consumed/cancelled/expired. Service enforces these allowlists, positive generation and immutable challenge binding. These are VARCHAR columns, not SQL enum/check proofs.
- Serialize institution, user, generation changes, verification, review and final activation. Check token user, current contact HMAC, purpose, public_id, generation, tenant, expiry and latest request together. An otp_token_id FK does not enforce token/user ownership; add direct-service and HTTP checks. A locked atomic consume must reject parallel replay; current find-then-save OTP consumption is not sufficient evidence.
- Hash challenge secrets with the existing purpose-bound primitive, including activation purpose/public_id/generation/channel/contact fingerprint. Store only a keyed normalized contact fingerprint on the request; actual contact stays on User. Require exactly one initial login contact. Reject unverified secondary contacts in this slice; preserve tenant-local uniqueness and existing phone/email comparison conventions.
- Challenge expiry limits code consumption. Recorded verification proof remains durable during review while the contact fingerprint matches; approval rechecks current identity/state, not an old code. Replacement generations cancel predecessors. Manual deactivation/rejection is never bypassed by an old invitation, resend, generic toggle or password-reset path.
- Contact changes require principal authorization, session revocation and new verification; keep the managed account inactive until the newly authorized activation completes. Initial staff invitation is authorized by the current tenant principal. Ordinary inactive-user reset/login behavior stays unchanged.
- Audit IDs/events/state only; no contacts, credentials, OTPs or financial values in logs. Activation resources allowlist IDs and state and omit contact_hash, token_id, raw code, password and private paths. Rejection reason is private stored data, not a raw audit/request-log payload.

## API contract

Paths are relative to /api/v1. Use existing Controller → FormRequest → Service → Resource, localized errors, tenant/host middleware and server-owned status/actor fields.

| Endpoint | Required behavior |
|---|---|
| Existing POST /super/institutions | Central Super Admin only; institution fields and admin.name/admin.contact; approved review, inactive recipient until verification/password setup; one shared provisioning service. No supplied reusable admin.password or client authorization fields. |
| POST /public/institutions | Central host; institution fields, principal name/contact/password+confirmation; pending response with opaque tracking IDs, no secret or access token. |
| POST /public/institutions/{id}/verify | Central host; bound request public_id/code; recipient password+confirmation only for Super Admin-provisioned principal; verify correct first admin, no arbitrary user_id and no API token. |
| POST /public/institutions/{id}/verification | Central resend; tracking ID and matching normalized contact, generic 202 known/unknown response; rate limits, no user/state disclosure. |
| POST /super/institutions/{id}/approve-registration | Active central Super Admin; decision=approve/reject, rejection reason required; require current proof before approval, identical retry idempotent/conflict 409. |
| POST /admin/staff | Active tenant principal; name plus exactly one contact, inactive institution_staff identity, recipient activation; no implicit HR profile/membership/duty. |
| POST /admin/staff/{id}/activation | Principal-only same-tenant reissue; new generation and audit; manually deactivated accounts need explicit reactivation authorization. |
| POST /auth/activate | Unauthenticated on the correct active tenant host; pending principal-authorized staff request public_id/code/password+confirmation; never a principal-registration bypass. |
| PUT /admin/staff/{id} | Principal-owned allowlist; contact verification and account lifecycle rules; deactivation revokes tokens and pending challenges atomically. Authorization assignments use separate routes. |
| PATCH /staff/profile | Active own identity; User.name/avatar only, validated multipart file; reject all contact/status/role/HR/payroll/employee/membership/duty fields and client file paths. |

Numeric OTP expiry uses existing auth_policy.otp.minutes=5 and five wrong-attempt invalidation. Approved configurable initial limits: public creation 5/hour/IP; resend 1/minute/request and 5/hour/contact fingerprint; verification 5/minute/challenge+IP. Register the absent signup limiter during runtime implementation, plus activation-resend. Delivery is after commit and recoverable by reissue without active-account leakage. Existing OtpService::sms logs codes locally: activation must use a redacted transport and in-memory test fakes, never raw-secret application logs. Keep phone verification pending/fail closed without a safe configured delivery channel; no silent success or email-only substitution. Public exposure waits for verified runtime/security/delivery acceptance, not another approval of the already-final activation policy.

## Identity, HR and resource ownership

User remains the only login identity. User.name/avatar are account display fields; StaffMember.name/photo and existing Teacher/StaffMember designation/employment/payee/history fields remain HR-owned. Do not overwrite employment records or financial snapshots from display/department edits. Avatar uses the existing private institutions/{inst}/users/{uid}/ path; StaffMember.photo retains its existing HR storage contract.

An existing User may link to one Teacher and one StaffMember without merging either payee or history. A user without HR profiles may have a non-HR duty; do not fabricate profiles. Ambiguous multiple same-type links fail closed and require reviewed reconciliation. Null legacy staff links and department strings grant nothing. R3.6b uses expand/report-only mapping/principal review/per-tenant switch; zero unresolved identity collisions and an explicit mapping are required before a tenant switches. Keep old role values for controlled rollback, revoke new sessions and never restore revoked grants or rewrite history implicitly. No automatic backfill or shared data migration.

## Permission contract and auth configuration

The approved current-route matrix covers 297 entries and 150 exact keys: 10 own-identity exceptions, 4 action selectors, 2 report-type selectors, 140 exact-duty routes, 103 preserved nonstaff boundaries and 38 principal-only controls. These counts describe the captured existing routes, not a complete future route count. The generated R3 plan adds twenty R3.6a and two R3.6b foundation routes; their target classifications are included separately in the matrix. New runtime routes must join the route inventory before rollout acceptance.

No wildcard or user-defined executable permission keys. Principal authority bootstraps account/security/department administration without an implicit department, while retaining tenant/module/D33/maker-checker checks. Staff require active same-tenant account, non-archived department, effective active membership, assigned active duty, exact key, resource predicate and module/feature checks on every request. Do not spoof an old actor role to make a service allow access. Keep student/parent/platform/public branches and ownership intact. Route-level permission never bypasses service-level principal approval or D33.

Academic staff retain linked-teacher/batch/subject constraints; no institution-wide academic grant is added here. Own teacher endpoints require the real own profile/payee. Reads never imply write/export/approval. Dynamic refunds/advances/leaves/imports and report types use the explicit selector variants, unknown values denied; no blanket transition/report grant. Existing sensitive approval/maker-checker/state/retry/append-only rules remain.

Seven existing auth/session self routes and three own-notification routes are active-identity exceptions, not business permissions. Shared program/batch reads require explicit staff academic read keys, preserving other roles' existing branches. New own profile edit is likewise an identity-only allowlist; it never activates an account or assigns a duty. Department context index/show expose only assigned active own memberships, with no unrestricted business-data read.

Runtime foundation must register institution_staff in R3 release roles, all four institution-type login allowlists and token lifetime configuration under tests: 720 minutes absolute/60 idle, existing max-token/revocation policy. This is a login identity, not a grant. Preserve existing-role token assertions and R1 historical configuration samples. Until a route's capability/resource enforcement and tests are implemented in R3.6b, it is unavailable to institution_staff. Revocation/end dates/deactivation/archive take effect on the next request without stale permission caches. Archive returns 409 while active memberships/duties remain; principal resolves them explicitly; no automatic obligation transfer/history rewrite.

## Export, purge and acceptance

Exclude institution_registrations and account_activation_requests from both backup/export: a different tenant cannot inherit approval or replay verification proof. Imported/new institutions require fresh provisioning/review/proof; no fake proof is generated. Purge activation requests before otp_tokens/users and registrations before users/institutions, alongside existing department child-first order. This checkpoint specifies policy and generated metadata only; actual import/purge runtime work stays with its approved task and tests.

Future focused tests: InstitutionSignupTest, StaffAccountTest, DepartmentManagementTest, DepartmentTenantTest, then DepartmentAuthorizationTest, StaffMigrationTest, PayrollDesignationCompatibilityTest and DepartmentRouteInventoryTest. Cover prerequisite-denial order, concurrency/replay/stale contact/purpose/generation, delivery failure/retry, manual deactivation/toggle/reset bypass, tenant FKs, private serialization, no default grants, four types, profile fields and unchanged HR history. SQL/SQLite schema probes alone prove none of these service or persisted browser behaviors.

D90 permits adapting only SuperInstitutionTest::test_opening_an_institution_creates_its_admin_and_its_type_defaults superseded immediate-active/supplied-password expectations into pending/contact-verification/recipient-password proof. Retain all other assertions, host/type/no-plan/SMS/module/tenant checks and existing tests; additive auth/role/token/bootstrap/security coverage remains required. Do not change tests in this canonical-only checkpoint. Full focused/API/frontend/theme/reference/parity/export/query/freshness/deep/guard gates remain mandatory before task acceptance; R3.6a/b stay unchecked.

## D91 — Business-request department context

Owner finalized the context contract and explicitly directed the separate D91 registry checkpoint, committed as 4b29f90. For institution_staff business requests, require one X-Department-Id header containing a positive decimal department ID. Reject missing, empty, malformed, multiple/comma-separated or array-like values. Identity-only endpoints retain their existing boundaries and do not require a business-context selector.

The header is only a selector, never membership or permission proof. On every request recheck active tenant, fresh account, selected active department, own effective membership, active assignment/duty and exact route/action permission, plus real Teacher/payee/resource ownership, independent module/feature gates, D33 and principal/maker-checker rules. Never union permissions from other departments: a key held only elsewhere does not authorize the selected context. No first/sole-department fallback, legacy role/text grant, body/query override or cached grant.

Switching means supplying another selector on the next request and revalidating it in full. Introduce no selection storage, cookie, token claim, endpoint or migration. This contract does not authorize tenant rollout, legacy conversion/mapping, public exposure, UI or R3.6b completion. Business routes remain unavailable until their route-specific context/capability/resource/module enforcement and focused tests pass. The approved route matrix is unchanged.


## D92 — First staff subject-index resource scope

Owner finalized the scope in owner/r36b-subject-index-scope-review.md and explicitly directed separate registry checkpoint 4cac920. For the existing GET|HEAD api/v1/subjects route, institution_staff requires D91 selected-department authorization with exactly staff.subject.index and a fresh active unambiguous own Teacher identity.

Grant only subjects explicitly assigned to that Teacher through nonzero batch_teachers.subject_id rows in own-tenant upcoming/running batches, with Subject.program_id equal to Batch.program_id. Deduplicate subjects. A program_id filter only narrows this set. Return only subject id/name and program id/name; preserve the existing admin response.

Direct subjects.teacher_id, the zero-subject sentinel, teacher_subjects rows and class-teacher ownership alone do not grant this first staff subject read. Preserve their data and legacy consumers. Any source expansion requires separate review. This authorizes no additional detail/write/export/student access, schema, endpoint, UI, tenant switch or mapping conversion. Keep the route unavailable to institution_staff until its focused integration and required checks pass; this canonical refinement is not runtime exposure or R3.6b acceptance.


## D93 — First staff subject-show resource scope

Owner finalized the scope in owner/r36b-subject-show-scope-review.md and explicitly directed the separate registry checkpoint 8cf6f8f. Existing GET|HEAD api/v1/subjects/{id} requires D91 selected-department authorization and independently exact staff.subject.show, plus fresh active unambiguous own Teacher.

Restrict the path-bound subject to that Teacher's explicit nonzero batch_teachers assignment in own-tenant upcoming/running batches where subject and batch program match. Preserve D92's exclusions: direct subjects.teacher_id, zero sentinel, teacher_subjects and class-teacher ownership alone do not grant access. Return only subject id/name and program id/name; preserve the existing admin response. Index permission alone does not authorize show, and show permission alone does not authorize index.

Invalid context/duty/Teacher is denied403; a foreign/nonexistent/non-owned path subject is404 after valid prerequisites. Query/body IDs cannot override path ownership. Preserve numeric path and independent security/module boundaries, legacy data/consumers and other-action default-deny. No marks/teacher identity disclosure, write/export/student access, mapping, tenant switch, schema, new endpoint or UI is authorized. Keep staff show unavailable until its integration and required checks pass; this canonical refinement does not complete R3.6b.

## D94 — First staff teacher-index resource scope

Owner finalized the own-only scope in owner/r36b-teacher-index-scope-review.md and separately registered D94. Existing GET|HEAD api/v1/teachers for institution_staff requires D91 selected-department context, independently exact staff.teacher.index, and a fresh active unambiguous own Teacher linked by user_id to the authenticated User.

Return only that Teacher's id and current linked User.name as a one-row own-profile collection, never a department or institution directory. Nullable q retains max:50 validation but searches only the own User.name, never phone or employee_id. Preserve existing status validation values only as a narrowing filter on the own active row; inactive/on_leave returns empty. Caller actor/user/teacher/department/program selectors cannot replace server-derived context or broaden scope.

Preserve the existing admin query and response. Invalid context/key or missing/inactive/ambiguous own Teacher is denied403. No contact/HR/payroll fields, other Teacher records, detail/write/export/student access, implicit profile creation, shared-batch or department-text grant, mapping, tenant switch, schema, new endpoint or UI is authorized. Keep the staff index unavailable until its route integration and D94 tests pass; this is not runtime exposure or R3.6b completion.

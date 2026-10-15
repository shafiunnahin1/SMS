# Department And Duty-Based Staff Authorization Plan

**Status:** Approved decisions D88/D89 are committed as 0149d9b. Canonical R3 planning includes R3.6a/b after accepted R3.6; runtime implementation has not started. Public activation policy remains pending owner acceptance.
**Decisions:** D88 and D89, owner-approved in chat on 2026-10-15. D88 supersedes D17 for institution staff, including teachers. D89 allows both Super Admin provisioning and principal self-registration; D47/D55 subscription, billing, trial, and module-gating deferrals remain unchanged.
**Repository:** `E:\Projects\School Management`

## 1. Goal

Support two institution onboarding paths: Super Admin provisions the institution and its first principal/admin account using the principal's phone/email, or the principal self-registers and becomes the first admin. After onboarding, the principal/admin creates staff accounts, defines departments and available duties, and assigns staff to one or more departments. A staff member sees only assigned department portals and can perform only the allowlisted actions assigned there.

Designation is an institution-provided display label. It is not an authorization role and never grants access by itself. Teachers use the same staff authorization model and may also receive duties in other departments.

## 1.1 Safe-Start Defaults For Owner Review

These are conservative implementation recommendations, not additional locked decisions:

- **Principal self-registration:** create the institution and first principal account as pending; require verified phone/email and Super Admin approval before activating tenant access. Apply existing rate-limit patterns, duplicate/slug checks, one-time verification, and audit. Keep the public signup route disabled until the owner accepts this activation policy. Super Admin provisioning uses the same onboarding service and can complete setup directly.
- **No implicit access:** neither onboarding path creates departments, staff, duties, permissions, subscriptions, trials, or module gates.
- **One login identity:** `users` remains the authentication identity. Existing `Teacher` and `StaffMember` records remain attendance/payroll profiles and link to that user; department membership attaches to the user, not a duplicate login/profile.
- **Payroll compatibility:** existing `Teacher.designation` / `StaffMember.designation` remain the payroll designation source because salary/bonus rules consume them. Principal/admin controls these HR fields in the first release. Do not let a department display title alter payroll eligibility.
- **Profile self-service:** first-pass staff self-edits are limited to name/photo; phone/email changes require verification. Principal/admin controls employee ID, payroll fields, designation, department memberships, duties, and account state. Expand the field allowlist only with tests and audit rules.
- **Legacy department labels:** old `Teacher.department` / `StaffMember.department` strings are import hints only; they grant no access. Principal/admin must review each mapping before it creates a department membership or duty.

## 2. Decisions And Invariants

- The institution principal/admin creates and manages staff accounts using an email address or phone number. Staff do not self-register.
- The first institution principal/admin account can be provisioned by Super Admin or created through principal self-registration. Both paths share tenant-safe validation and account setup; neither silently creates departments or staff permissions.
- The principal/admin creates departments and controls staff membership, designation, duties, permission assignments, and account status.
- Staff may update their own permitted, non-authorization profile fields. The principal/admin may update those fields too.
- One staff account may belong to multiple departments. Each department membership has its own designation and duty assignments.
- A duty is a human-readable label bound to one or more code-owned, allowlisted permission keys. A custom duty label cannot create an arbitrary permission or API capability.
- Authorization is checked on every API action using tenant, active account, active department membership, and assigned permission. Hiding a menu item is not authorization.
- Existing `module:` and `feature:` gates remain additional restrictions. A staff permission cannot enable a disabled module or plan feature.
- Department context is resolved and checked on the server. Client-supplied department IDs are never trusted as proof of membership.
- Staff cannot grant themselves access, change their own designation, change their account status, assign duties, or alter permissions. First-login contact verification/password setup proves control of the registered identifier only; it does not activate an account or grant access.
- Student, parent, and central-platform roles remain separate. Institution admin/principal remains the trusted institution owner/administrator role.
- Finance, payroll, student-sensitive data, and permission changes require audit history. Existing maker-checker and tenant-isolation requirements remain in force.
- No automatic broad access is inferred from a designation such as “Principal,” “Accountant,” or “Teacher.” Any migration mapping is explicit and least-privilege.

## 3. Current-State Gap

The current implementation stores institution roles in `users.role`, uses `RoleMiddleware`, and filters menus by fixed role and institution-type role allowlists. Teacher and accountant are fixed roles; `private_batch` currently excludes teacher. The router creates `NotBuilt` placeholders for menu entries without a page component. Super Admin currently creates the institution and first admin through `/super/institutions`; public `/signup` is a placeholder and D60 deferred self-registration. D89 now authorizes both paths, but neither path has been implemented as D89 requires.

D88 changes the authorization source for institution staff. The current enum/middleware/allowlist cannot express custom departments, multiple department memberships, free-text designations, or per-department duties. D89 changes only institution onboarding ownership; D55's subscription/billing deferral remains. This plan therefore covers both onboarding paths, schema, API authorization, staff lifecycle, navigation, existing route integration, and migration—not only a new settings screen.

## 4. Proposed Domain Model

Final names and columns are subject to the schema-design gate. The model must support at least:

1. **Departments:** institution-scoped name, optional code/description, active/archived state, audit fields, and safe uniqueness rules.
2. **Login identity:** the existing institution-bound `User` remains the authentication identity, created either for the principal by one of the D89 paths or later by the principal/admin for staff. Do not create a second login identity for the same person.
3. **Legacy staff/teacher profiles:** reconcile existing `Teacher` and `StaffMember` records with the single login identity. Preserve existing teacher/staff IDs, employee IDs, attendance/leave links, salary/payee references, and history. A staff profile with nullable `user_id` may receive a login later without duplicating the profile.
4. **Department membership:** tenant-bound link between the login identity and department, with active dates/status and creator/updater audit fields. Membership is the permission scope; the legacy text `department` field is not an authorization source. Do not add a second competing designation field before resolving the existing Teacher/StaffMember/payroll designation source.
5. **Duty catalog:** stable code-owned permission keys with descriptions, applicable modules, sensitivity, and whether approval is required.
6. **Department duties:** principal-defined duty labels for a department, each selecting only from the duty catalog. A duty may group multiple allowlisted actions.
7. **Staff duty assignment:** assignment of one or more department duties to a specific membership, with assigner, timestamps, revocation, and audit history.
8. **Audit events:** account creation/status/profile changes, department changes, duty/permission grants and revocations, sensitive reads/actions, and approvals as required by existing retention/security policy.

Do not store executable permission names supplied by a browser. Do not let a tenant define new permission keys. The catalog is shipped and reviewed with code; principals may select and group its allowed entries into department duties.

## 5. Account Lifecycle

1. **Create the institution's first principal:** either Super Admin enters the institution and principal's phone/email, or the principal submits the public registration form. Both call one tenant-safe onboarding service and produce one institution plus one first `admin` identity.
2. Enforce verified contact, tenant-local/global identifier rules as defined by D7, unique institution slug/domain, idempotency, rate limits, and transactional rollback. The principal becomes active only after the chosen contact is verified and any approved institution review step is complete.
3. Do not create departments, staff, duties, plans, subscriptions, trials, or module restrictions implicitly. D47/D55 pricing and billing remain deferred.
4. **Create later staff accounts:** principal/admin enters at least one phone/email; no staff self-registration. The new account links to an existing Teacher/StaffMember profile where applicable, or the existing profile is linked/created under the approved mapping.
5. Principal/admin alone chooses or changes account active/pending/locked/deactivated state. Contact verification/password setup proves control of the identifier only; it cannot activate a pending account or grant permissions.
6. On first login, staff complete permitted profile fields and set/change their password. Staff may edit only allowlisted non-authorization fields; login identifier changes require re-verification. Department membership, duties, permissions, designation, and account status remain principal/admin-controlled.
7. Deactivation or removal of the last active membership revokes applicable sessions and blocks tenant API access immediately.

## 6. Authorization And Request Flow

1. Authenticate the user and resolve the institution from the request host using the existing tenancy rules.
2. Preserve separate handling for central platform roles and student/parent identities.
3. Resolve the requested department server-side and verify that it belongs to the current institution and that the staff membership is active.
4. Verify the code-owned permission key for the requested action against the staff member's active duties in that department.
5. Apply existing tenant, `module:`, and `feature:` gates as additional restrictions.
6. Apply approval/maker-checker policy for sensitive actions; record actor, institution, department, target, decision, and timestamp without leaking sensitive data into logs.
7. Deny by default for missing, revoked, stale, cross-tenant, unknown, or unmapped permission assignments.

The portal selector is a convenience, not a security boundary. Direct URL/API requests must receive the same checks. Permission changes and revocation must take effect without waiting for a long-lived cached session.

## 7. Phased Implementation Sequence

### Gate 0 — Contract And Permission Inventory

- Reconcile D88 with D17, D6, D7, D25, D32, D33, institution-type rules, and existing auth/session behavior.
- Reconcile D89 with D55/D60: both institution onboarding paths are allowed, but subscription plans, trials, billing, and size/module limits remain deferred. Define institution review/activation and abuse-control behavior before public signup is exposed.
- Verify that institution registration provisions the first institution principal/admin account, securely binds it to the new tenant, and does not create staff departments or permissions implicitly.
- Inventory every institution API route and tag it as student/parent/platform, principal-only, or staff duty-protected.
- Define the first allowlisted permission catalog from existing modules. Start with only supported actions; mark unavailable/placeholder workflows as unavailable.
- Define the first-pass role-neutral department templates as optional suggestions only; creating an institution must not silently grant departments or permissions.
- Resolve open activation, account-profile, and migration questions before protected schema/plan edits.
- **Exit:** owner-approved, testable permission matrix and complete route inventory; no implementation scope inferred from menu labels alone.

### Gate 0.5 — Institution And Principal Onboarding

- Replace the current Super Admin-only institution creation assumption with two explicit entry paths: Super Admin creates the institution/first principal, or the principal self-registers.
- Route both paths through the same transactional onboarding service; prevent duplicate institution/principal creation, enforce contact verification and safe slug/identifier handling, rate-limit public entry, and audit Super Admin provisioning.
- Keep subscription/trial/billing out of this onboarding slice under D47/D55. Do not silently create departments, duties, or staff accounts.
- Test duplicate requests, verification expiry/replay, transaction rollback, unauthorized tenant access, and both provisioning paths using disposable fixtures.
- **Exit:** first principal is correctly bound to the new tenant in both paths; no unverified or duplicate principal receives active access; signup review/activation policy is owner-approved.

### Gate 1 — Schema And Backward-Compatible Identity

- Design tenant-bound department, membership, duty, assignment, and audit storage; add indexes and foreign keys for institution isolation.
- Map current `User`, `Teacher`, and `StaffMember` tables before designing additions. Keep one login identity per person; preserve optional `StaffMember.user_id`, `Teacher.user_id`, employee IDs, payee types, attendance/leave references, and payroll history.
- Decide which existing profile remains the source for employment designation/department data. Payroll bonus/salary logic currently consumes designation; department membership labels must not silently rewrite payroll designation or historical snapshots.
- Choose how staff identity is represented without using a free-text designation as a role. Preserve student, parent, central-platform, and institution-principal semantics.
- Plan an expand/backfill/switch migration. Do not drop or narrow the existing enum until compatibility and rollback are proven.
- Add factories/seed fixtures for multiple departments, multiple memberships, teachers, accountants, and private-batch staff.
- **Exit:** schema review, tenant-bound constraints, migration dry-run, rollback strategy, and isolation tests pass.

### Gate 2 — Permission Catalog And Authorization Service

- Implement a typed, code-owned permission catalog and duty-to-permission validation.
- Implement membership resolution, current-department context, policy service, and middleware/policies for API actions.
- Keep `module:`/`feature:` checks independent and additive; unknown permission keys fail closed.
- Add negative tests for self-elevation, inactive membership, cross-tenant department IDs, stale permissions, and direct API access.
- **Exit:** protected routes enforce the service regardless of frontend state; tenant/permission tests pass.

### Gate 3 — Department Setup Portal

- Principal/admin can create, rename, archive, and view departments with safe history-preserving rules.
- Principal/admin can define department duty labels by selecting only allowed catalog permissions.
- Show which modules/actions a duty covers before it is assigned; unavailable modules cannot be assigned as working access.
- Prevent archiving a department with unresolved active assignments or historical obligations without an explicit safe transfer workflow.
- **Exit:** department/duty CRUD, validation, module gating, audit, and admin authorization tests pass.

### Gate 4 — Staff Account And Profile Management

- Principal/admin creates later staff accounts using phone/email, edits permitted profile fields, changes account status, and initiates secure activation/reset. First-principal creation is implemented and tested in Gate 0.5.
- Staff may edit their own allowlisted profile fields and complete first-login verification/password setup; only principal/admin can activate/deactivate accounts or change authorization fields.
- Handle duplicate identifiers, pending activation, expired activation, lockout, deactivation, session revocation, and reactivation.
- **Exit:** account lifecycle works without self-registration or password disclosure; profile-field and auth tests pass.

### Gate 5 — Membership, Designation, And Duty Assignment

- Principal/admin assigns an account to one or many departments, sets free-text designation per department, and assigns/revokes department duties.
- Show effective permissions as a readable summary and warn about sensitive permissions and approval requirements.
- Record who granted/revoked every assignment. Require re-authentication or a suitable confirmation for high-impact changes if existing policy requires it.
- **Exit:** combined permissions are least-privilege, department-scoped, audited, and immediately revocable.

### Gate 6 — Login, Department Portal, And Navigation

- After login, show the staff member's active department portals; if only one exists, enter it directly or show the single department home consistently.
- Each portal displays only actions allowed by assigned duties and current module/feature gates.
- Add department switching that changes server-verified context; do not let a URL, query parameter, or local storage value elevate access.
- Keep student/parent and central platform navigation unchanged.
- **Exit:** portal UI, loading/empty/error states, Bengali/English labels, RTL safety, keyboard access, and 360px/desktop behavior pass.

### Gate 7 — Existing Module Route Integration

- Integrate permissions with each existing API route; use explicit action keys and resource-level checks (e.g. own department, own assigned records, allowed financial action).
- Map fee collection, cashbook/refund, expenses, reports, exams/marks, attendance, HR/payroll, inventory, and question-bank actions only where the current backend supports them.
- Separate preparation, review, and approval for refund/payroll/other sensitive actions; do not grant approval from a broad “Finance” label.
- Return clear forbidden/module-disabled responses for an assigned duty whose module is unavailable.
- **Exit:** route inventory has no unclassified tenant route; API tests prove least-privilege behavior for each mapped action.

### Gate 8 — Existing User Backfill And Tenant Rollout

- Dry-run a mapping of existing teacher `User` and `Teacher` records, accountant/staff `User` and `StaffMember` records, nullable profile `user_id` links, employee IDs, payee types, salary/bonus designation rules, attendance, and leave into one login identity plus department memberships/duties.
- Preserve existing `department` strings as legacy metadata until principal review; never turn a string label or job designation directly into a permission.
- Retain institution admin as principal/admin and student/parent as separate identities. Reconcile accounts linked to both Teacher and StaffMember profiles without duplicate logins or broken payroll/payee history.
- Treat private-batch tutor/teacher cases explicitly; do not reject a staff member only because the old type allowlist omitted the `teacher` enum role.
- Review generated mappings with institution owners before applying. No blanket access grant from designation or legacy role name.
- Roll out in expand/backfill/switch/cleanup stages with counts, mismatch reports, rollback checkpoints, and no destructive migration of active data.
- **Exit:** every legacy account is mapped, intentionally excluded, or reported for owner resolution; access is not broader than before without approval.

### Gate 9 — Security, Acceptance, And Release

- Run full backend/frontend tests, theme/lint/build checks, authorization route inventory, tenant isolation tests, fresh migration tests, reference/parity checks, and deep verifier/agent guard.
- Test school, college, coaching, and private batch separately, including private batch with multiple staff even though its legacy role list lacks `teacher`.
- Test principal creates two staff; one member in two departments; different duty sets; direct URL and API denial; revocation; account deactivation; profile edits; and sensitive maker-checker flows.
- Perform manual desktop/mobile portal walkthroughs using disposable/test data; do not mutate a shared demo database for persistent E2E.
- Keep the feature behind an explicit release/module gate until the owner accepts all required evidence.
- **Exit:** all task acceptance commands pass, no unresolved critical authorization gaps, migration/rollback rehearsal passes, and owner accepts the release gate.

## 8. Minimum Permission Families To Inventory

These are candidate action groups for Gate 0, not permissions granted by this plan:

- Institution operations: dashboard/report viewing, staff/account management, department/duty administration.
- Admissions/records: applicant review, enrollment, student profile read/update, documents/import/export.
- Academic/exams: programs/batches, attendance entry/review, marks entry/review, result publication.
- Finance: fee view/collect, dues, expense prepare/approve, cashbook view/close, refund request/approve, reports.
- HR: staff record view/update, attendance, leave review, salary structures, payroll prepare/approve/view.
- Operations: inventory view/issue/adjust, library catalog/issue/return, transport/hostel/facility operations.
- Student support: notices/messages, parent meetings, leave, health/behavior/risk data with strict sensitivity limits.

Each action must be separately justified, module-gated where applicable, and tested for resource scope. Read access to health, behavior, payroll, and sensitive financial data must not be bundled implicitly with ordinary department membership.

## 9. Acceptance Criteria

- Super Admin can create an institution and its first principal/admin using phone/email, and a principal can self-register; both paths create exactly one verified first admin for the correct tenant.
- Principal/admin alone can create later staff accounts, departments, designations, memberships, and assignments.
- Institution/principal onboarding creates no department or staff permission implicitly; subscription/trial/billing remains out of scope.
- Email or phone is sufficient as the configured login identifier; duplicate handling follows institution-local uniqueness rules.
- Staff can update only allowed profile fields and cannot alter role-equivalent permissions, title assignment, department membership, or account status.
- Teachers and non-teaching staff use the same department authorization model and can hold multiple department memberships.
- A staff member sees only assigned department portals; direct URL/API calls to an unassigned department/action fail closed.
- An assigned duty cannot bypass tenant isolation, disabled modules/features, resource ownership, or maker-checker controls.
- Revoked permission, membership, or account status blocks access immediately and is audited.
- Cross-tenant IDs and department context manipulation never disclose records.
- Existing student, parent, Super Admin, content writer, and content moderator flows remain unchanged.
- Legacy users migrate without silent privilege expansion, lost records, or unrecoverable login state.
- Reports/logs never include passwords, activation secrets, sensitive child data, or unredacted financial details.

## 10. Open Design Decisions Before Implementation

1. **Self-signup review state and abuse controls:** accept or change the recommended pending + contact verification + Super Admin approval flow before public signup is enabled; finalize rate limits, duplicate handling, and recovery.
2. **Account activation:** choose and verify an existing secure flow (verified email/phone OTP or time-limited activation link/code). Never display a reusable password to the principal.
3. **Editable profile fields:** define exactly which fields staff can self-edit, which require re-verification, and which only principal/admin can edit.
4. **Profile/designation source:** decide how Teacher and StaffMember profiles share one account, and whether a person may hold different display titles by department without changing payroll designation.
5. **Department templates:** decide whether to offer optional type-specific starter templates; principal must explicitly choose/create departments and duties.
6. **Permission catalog ownership:** confirm the platform ships the allowlisted action catalog while principals may create labels/groupings only, not executable permissions.
7. **Department archive/transfer:** define handling of records, pending approvals, and audit history when a department closes or a staff member leaves.
8. **Legacy mapping:** review proposed default duties for existing teachers/accountants and StaffMember records per institution before any data backfill.

## 11. Scope Boundaries

- This document is a complete proposed implementation sequence, not executable generated release tasks and not authorization to start coding ahead of the user's requested plan-first workflow.
- D88/D89 and this standalone plan do not by themselves add an executable current-release task. Before implementation, add a scoped D88/D89 task to the generated active R3 plan through its approved source/generator, with dependencies and acceptance evidence; until then G1 blocks coding this cross-cutting feature as an unplanned task.
- Keep public principal self-registration disabled until the owner accepts the activation/review recommendation and the corresponding security tests pass; the Super Admin-provisioned path remains separate.
- Do not modify `docs/AGENT-PLAN-R3.md`, `docs/release/r3-plan.json`, release module lists, or protected module specs as part of this planning artifact. Those require their normal generator/guard and D88/D89 change-request procedure when implementation scope is accepted.
- Do not add a third-party permission package without an approved dependency decision. The catalog/policy design must fit repository constraints unless the owner approves otherwise.
- Do not change student/parent/platform authorization, billing, unrelated module scope, or production data.
- The first release keeps department, staff account, designation, duty, and permission administration principal/admin-only; delegated department managers are out of scope.
- Keep this plan as the standalone review artifact. After the owner accepts it and the guard-approved task plan is prepared, implement one gated slice at a time with focused tests and progress evidence.

## 12. Proposed Dependency Summary

`Gate 0 → Gate 0.5 → Gate 1 → Gate 2 → Gate 3 → Gate 4 → Gate 5 → Gate 6 → Gate 7 → Gate 8 → Gate 9`

Before Gate 0.5 code, D89's owner-approved scope must be reflected in the generated R3 task plan and its guard checks. Gate 7 may start route-by-route only after Gate 2 passes. Gate 8 migration rehearsal must not precede authorization tests and explicit owner review of the complete Teacher/StaffMember/payroll mapping. Gate 9 is release-wide and cannot be marked complete while any security, migration, or route-inventory acceptance item is missing.

## 13. Active R3 Task Placement

The generated task plan must encode these dependencies before implementation:

1. **R3.6a — Institution onboarding and department/staff data foundation**, after R3.6. Own the four tenant-bound department/membership/duty-assignment tables, principal/staff provisioning APIs, shared D89 onboarding service, contact verification, and department/duty administration APIs. Public self-registration remains disabled until the owner accepts the review/activation policy.
2. **R3.6b — Staff authorization rollout and legacy mapping**, after R3.6a. Replace fixed-role authorization for institution staff with department membership/duty checks across existing API routes; preserve student/parent/platform roles and module gates; map Teacher/StaffMember/payroll records without changing historical designation or salary snapshots.
3. **R3.7 — Payroll run**, must depend on R3.6b so payroll routes cannot ship with obsolete `teacher`/`accountant`-only authorization.
4. **R3.12 — Department portals and role-based pages**, retain its existing dependency on R3.11 and add principal department/account/duty screens plus staff department selector/portals and permission-filtered navigation. Route authorization remains server-side.

The R3.6 D87 runtime implementation is checkpointed at d0d481d and accepted in pushed bdcdeae after full API/frontend and exact pushed-tree deep verification. R3.6a/b appear in canonical `docs/release/r3-scope.json` and regenerated outputs under D88/D89. R3.6a remains incomplete: resolve the open Gate 0 decisions before runtime implementation; never hand-edit generated R3 plans. Current evidence and unresolved contracts: `owner/department-staff-readiness-review.md`.

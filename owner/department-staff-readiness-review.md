# R3.6a Gate 0 readiness review

Status: CONTRACT APPROVED under D90 / runtime INCOMPLETE. This packet grants no permissions or schema/runtime authorization. The owner separately finalized the public activation policy on 2026-10-16; the remaining contracts were subsequently approved by D90 as recorded below. R3.6 was accepted in pushed `bdcdeae`; R3.6a is next, followed by R3.6b and R3.7.

## Authority and execution boundary

D88/D89 were explicitly approved and separately committed in `0149d9b`. Canonical scope, generated plan and supporting metadata were aligned in `e8f0bd6`. They authorize the department/onboarding direction and preserve task order.

The standalone plan still explicitly requires the following before implementation:

> Resolve open activation, account-profile, and migration questions before protected schema/plan edits.

> Exit: owner-approved, testable permission matrix and complete route inventory; no implementation scope inferred from menu labels alone.

Source: `DEPARTMENT-DUTY-AUTHORIZATION-PLAN.md`, Gate 0 and section 10. The owner explicitly answered the public activation-policy question on 2026-10-16: principal contact verification alone is insufficient; Super Admin approval is also required, both institution/account remain inactive, and pending tenant access is denied. Other section 1.1 defaults remain recommendations. No approval of the remaining questions is inferred.

## Current code evidence

- `api/app/Http/Controllers/SuperAdmin/InstitutionController.php`, `store`: creates an active institution and a first admin with a supplied password; there is no shared public/principal registration service yet.
- `api/app/Http/Requests/SuperAdmin/StoreInstitutionRequest.php`: first-admin phone and password are required; email is optional. This does not yet implement D89's phone-or-email activation contract.
- `api/app/Services/OnboardingService.php`: applies academic/type defaults. It does not verify principal contact or persist registration approval. Preserve its existing responsibilities until the approved shared provisioning contract is specified.
- `docs/database/schema.sql`: institutions have trial/active/expired/suspended/inactive status; no registration-review state is specified. Users have is_active and login-security fields; no durable verified-principal contact field is specified. The four planned department tables do not define these onboarding states.
- `api/app/Services/Auth/OtpService.php`: existing LOGIN/RESET purpose-bound hashes, expiry, wrong-attempt limits and consumption are reusable security primitives, but no onboarding purpose/state transition is defined. Reusing a consumed login/reset row as contact-verification proof would be an assumption.
- `Teacher` and `StaffMember` retain user_id, employee_id, designation and department fields. Existing salary and bonus rules consume HR designation; department labels must not silently replace it.

These are code/spec observations, not live tenant data or migration findings. No app/demo database was queried or migrated for this audit.

## Route inventory

Capture: `php artisan route:list --path=api --json`, exit 0, against runtime source accepted in `bdcdeae`. The review artifact is `owner/department-staff-route-readiness.json`. Each GET|HEAD result is one route-list entry.

| Current middleware bucket | Entries | Meaning for review |
|---|---:|---|
| legacy_staff_candidate | 104 | Current teacher/accountant role appears; every staff action needs an approved future duty/resource-scope mapping. |
| principal_only | 78 | Current role gate is admin only; review principal authority and sensitive approval separation. |
| shared_authenticated_review | 12 | Shared identity/self-service or shared academic reads; explicit classification is required. |
| public_or_callback | 12 | No Authenticate middleware; preserve current public/callback security boundary. |
| student_parent | 23 | Current gates contain only student/parent; preserve their separate authorization. |
| central_platform | 68 | Current gates contain only platform roles; preserve the central-host boundary. |
| Total | 297 | Complete middleware inventory, not a completed permission matrix. |

All 297 approved_duty_permission values are null. Buckets are inferred from current middleware and do not grant future access. The twelve shared routes cover auth self-service, own notifications, programs and batches; decide their identity-only versus duty-protected treatment explicitly. No Department/StaffAccount/DepartmentContext runtime controller exists yet.

## Owner inputs resolved under D90

Owner explicitly approved all six clauses and the exact matrix preserved in d7d9a23. D90 registry commit ff8547b records that approval. Use `docs/architecture/staff-account-contract.md` and `docs/department-permission-contract.json` for the canonical contract, including two tables/three routes, storage/API/activation/profile/HR mapping and permission rules. These are approved target requirements, not runtime proof. First checkpoint is canonical refinement/verification only; R3.6a/b remains incomplete until implementation and all required gates pass.

## Concrete recommendation prepared

The requested reviewable recommendation is now in `owner/department-staff-implementation-proposal.md` (clauses 1–6), with the complete route matrix in `owner/department-staff-permission-proposal.json`. It proposes two additional tables and three additional routes, explicit activation/profile/identity rules, and 150 exact candidate permission keys across all 297 existing route entries. Dynamic actions and report types are separately constrained. All matrix approvals remain null; canonical scope still has four tables and seventeen R3.6a routes. This proposal is not a locked decision, approved contract, implemented permission system or authorization to change existing tests.

## Owner resolution — D90

Owner explicitly approved proposal clauses 1-6 and its matrix; separate registry commit ff8547b. Gate 0's contract inputs above are now resolved by the exact approved proposal preserved in d7d9a23, including two tables/three routes and limited future test-expectation adaptations. Canonical execution contract: `docs/architecture/staff-account-contract.md`; matrix: `docs/department-permission-contract.json`. First update is canonical-contract refinement/verification only; no runtime implementation or task completion is inferred.

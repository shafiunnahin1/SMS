# R3.6a Gate 0 readiness review

Status: INCOMPLETE / owner contract review required. This packet approves no permissions, schema fields, activation policy or runtime work. R3.6 was accepted in pushed `bdcdeae`; R3.6a is next, followed by R3.6b and R3.7.

## Authority and execution boundary

D88/D89 were explicitly approved and separately committed in `0149d9b`. Canonical scope, generated plan and supporting metadata were aligned in `e8f0bd6`. They authorize the department/onboarding direction and preserve task order.

The standalone plan still explicitly requires the following before implementation:

> Resolve open activation, account-profile, and migration questions before protected schema/plan edits.

> Exit: owner-approved, testable permission matrix and complete route inventory; no implementation scope inferred from menu labels alone.

Source: `DEPARTMENT-DUTY-AUTHORIZATION-PLAN.md`, Gate 0 and section 10. Its section 1.1 calls the defaults recommendations, not additional locked decisions. No response to the pending activation-policy question is inferred from the owner's absence.

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

## Owner inputs needed for the next implementation checkpoint

1. Finalize pending + contact verification + Super Admin approval behavior, including the Super Admin-provisioned path, abuse/recovery rules and whether public signup remains disabled. An asynchronous question about the recommended public activation policy is pending.
2. Approve exact durable verification/review storage and API payload/state transitions. Canonical schema and contract must precede any additive migration; no new column/table is invented in this packet.
3. Finalize the staff self-edit field allowlist and contact re-verification behavior. Name/photo-only and principal-controlled HR fields remain recommendations until accepted.
4. Approve the User/Teacher/StaffMember ownership/mapping rules, duplicate-profile handling, HR designation source and non-destructive migration rehearsal. No legacy role/string grants a duty automatically.
5. Approve an action/resource-scope matrix for the inventory, including the twelve shared routes, permission catalog ownership, department archive/revocation and maker-checker separation. Optional department templates must never grant implicit access.

After those inputs, refine the canonical schema/API/tests under the approved Change-Request procedure, regenerate plans, verify and push one checkpoint, then implement R3.6a in its approved order. Keep R3.6a/b unchecked until their complete Done When passes. The first focused runtime checks remain InstitutionSignupTest, StaffAccountTest, DepartmentManagementTest and DepartmentTenantTest; none is claimed to exist or pass yet.

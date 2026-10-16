# R3.6b business-request department context binding review

Status: owner finalized the proposed context contract in chat on 2026-10-16. No new runtime header or business-route access implemented; separate owner decision checkpoint required by guardrails section 4 remains pending.

## Verified gap

- `docs/architecture/staff-account-contract.md` requires fresh same-tenant membership, exact duty, resource predicate and independent module/feature gates. It specifies own-context index/show, but no business-request selection transport.
- `DEPARTMENT-DUTY-AUTHORIZATION-PLAN.md` section 4 requires server-resolved context; Gate 2 requires current-department context, Gate 6 server-verified switching, and Gate 7 integration only after Gate 2. A client department ID is never proof of membership.
- `GET /teacher/batches` is approved as `staff.batch.mine`, with own real linked Teacher scope in `docs/department-permission-contract.json`. Its route has no department path parameter. Own-context index/show are read-only and do not persist a selection.
- No selected-department header, query parameter, token claim or server session field is specified in those canonical sources. `DepartmentDutyPermissionService::has` and the new academic predicate require an explicit department ID; neither chooses one.

## Owner-finalized context contract

1. For `institution_staff` business requests, require one `X-Department-Id` header containing a positive decimal department ID. Reject absent, empty, malformed, multiple/comma-separated or array-like values. Identity-only endpoints keep their own current boundaries.
2. Treat the header only as a selector. On every request, resolve the active tenant and fresh user, then the selected active department and effective own membership, active assignment/duty and exact route/action permission. No implicit first/sole department, union across departments, legacy text/role fallback, body/query override or cached grant.
3. A selected department with no exact key fails closed even when another membership has that key. Foreign, inactive, expired or revoked contexts fail closed without business data. Existing resource ownership, real Teacher/payee identity, module/feature, D33 and principal/maker-checker rules remain additive.
4. Switching means sending the next request with another selector, revalidated in full. No selection database field, cookie, token claim, new endpoint or migration is introduced by this proposal. A copied header cannot grant membership.
5. This defines context selection only. It does not approve a tenant rollout switch, legacy-role conversion, profile mapping, public exposure or UI. Those separate accepted-contract and review gates remain pending.

## Required proof after owner finalization

Missing/invalid/foreign selector, valid membership without key, key only in a different department, same-process revocation/archive/end-date, context switch, impersonation and stale identity must be denied. Positive own-resource reads must work for all four institution types without a role mutation, preserving unrelated role/module/host boundaries. Retain business default-deny until the route-specific integration passes.

AGENTS.md working rules 2/3 and G16 prohibit inventing an unstated contract silently. The owner has now finalized the selection contract. This packet does not amend a protected source or self-approve a decision. Guardrails section 4 still requires a separate owner-authored decision checkpoint before canonical protected refinements and runtime integration; the exact proposed registry row is in owner/decision-D91-context.md.

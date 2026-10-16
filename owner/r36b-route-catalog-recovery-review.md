# R3.6b route catalog: stopped checkpoint and concrete recovery

2026-10-16. Base: `921a522ad2a2fbbc65a5d738cfc582063993f7ba`, branch `claude/elegant-cori-gw2mw5`. R3.6a remains accepted; R3.6b is incomplete. No new business route is enabled.

## Why work stopped

AGENTS.md G12 and docs/ops/agent-guardrails.md G12 require STOP and a blocker entry after three failed attempts. Three full focused runs of `php artisan test --filter='DepartmentRouteInventoryTest|DepartmentAuthorizationTest'` each ended with 2 failed / 7 passed (1,012 assertions). A separate selector diagnostic also failed. The final proposed correction did not apply: its Python script used repository-relative `api/...` paths while running from the `api` directory, raised FileNotFoundError, and the following PowerShell test command still executed. This was an execution mistake; no assertion, canonical contract or existing route was changed to bypass it.

## Findings, with no further implementation

- The new code-owned catalog is an exact copy of the approved 297 captured descriptors plus 22 planned foundation descriptors; its parity test passes.
- A live callback action is `\App\Http\Controllers\Billing\SmsRechargeCallbackController@bkash`, while the approved CLI descriptor omits the leading namespace separator. The initial interpretation as doubled internal separators was incorrect. A read-only PHP probe proved lengths 65 versus 64 and the leading-separator difference.
- Synthetic `Illuminate\Routing\Route` fixtures constructed with only `uses` report `Closure` through `getActionName()` unless their `controller` entry is also supplied. A probe proved the synthetic action length was 7.
- No route/resource/module/D33 authorization has been integrated. Existing staff business default-deny and legacy role behavior remain unchanged.

## Smallest recovery after resuming

1. Run from the verified repository root `E:\Projects\School Management`; stop dependent commands immediately on a nonzero exit.
2. Compare the live action with the unchanged descriptor after stripping only the live leading namespace separator. Remove the mistaken internal-backslash normalization.
3. Give synthetic test routes both `uses` and `controller` entries with the canonical action; compare live namespace spelling consistently. Require a non-null GET result before checking HEAD equality so two nulls cannot satisfy that assertion.
4. Keep the entire canonical matrix, selectors, principal-only variants, mixed role boundaries, module/resource metadata and every existing test intact. Selector values must still come only from matched path parameters; body/query cannot override them.
5. Re-run the focused command. If green, run required full API/frontend/theme/spec/guard checks, record truthful evidence, then checkpoint/push only verified implementation.

## Local drafts retained, not committed

- `api/app/Support/DepartmentRouteCatalog.php`
- `api/app/Services/DepartmentRoutePermissionResolver.php`
- `api/tests/Feature/DepartmentRouteInventoryTest.php`

These drafts contain the failing intermediate state and are intentionally untracked. Do not treat them as accepted runtime enforcement or overwrite them without inspection. Their SHA256 evidence is in `%TEMP%/school-r36b-catalog-blocked-state.json`. `%TEMP%/school-r36b-catalog-focused.log/.exit` retains the last failed run; selector and live-action diagnostics are in the matching `school-r36b-catalog-*diagnostic*` files. No full-suite or new deep pass is claimed for these drafts.

Only this review and own handoff/progress/blocker hunks belong to the documentation checkpoint. Original owner log edits, decision drafts, caches and `text.txt` remain preserved. No schema, protected plan/guard/CI, dependency, reference-repository, app/demo DB, environment or live gateway change.

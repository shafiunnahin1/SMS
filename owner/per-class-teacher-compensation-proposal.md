# Per-class teacher compensation: owner proposal

Date: 2026-10-17. Status: NON-EXECUTABLE FEATURE PROPOSAL. This records a new owner request; it is not a locked decision, formal Change-Request, release-plan edit, schema/API authorization, or implementation approval. No decision number is assigned or reserved.

## Owner request interpreted

For schools, colleges and coaching institutions, the system must maintain class-count records. An institution may optionally configure extra earnings based on eligible classes taught, e.g. BDT 10 per eligible class, settled as a monthly payroll earning. The basic salary and existing benefits remain separate. The example rate is illustrative, not a default or approved amount.

Assumption for review: mandatory means all three named institution types must record eligible class activity; it does not mean every institution must enable/pay a per-class rate. The request does not yet say whether `private_batch` is included.

## Existing system evidence and boundaries

- `docs/modules/staff-payroll.md` already supports institution-defined salary components, Decimal `salary_adjustments`, and `extra_class` earnings. Current R3.6/D87 scope allows manual extra-class entries; it does not prove an authoritative class-count source or automatic monthly count calculation.
- The same payroll spec calculates attendance-based absence/LWP/late deductions, and `docs/modules/hr-payroll.md` D85 governs approved-leave snapshots/cancellation. This proposal must not duplicate those calculations.
- D32/D86 require immutable payroll snapshots and corrections by later adjustment, not edits to approved/paid payroll.
- D87 preserves fail-closed substitution suggestions and prohibits fabricated substitution effects. D95 says leave-linked cover does not automatically change payroll. A monthly proxy-class earning would require an explicitly approved extension and must not post during offer/acceptance transitions.
- The current module index marks `hr_payroll` as plan-gated and available to school, college and coaching, but absent in `private_batch`. D96 is a substitution-only design decision and does not authorize payroll feature/module changes.
- The requested class/period event source is not currently implemented: the routine builder and period-attendance routes/runtime remain absent in the live API. Existing student period-attendance rows, if later implemented, must not silently become proof of a teacher-taught class without an owner-approved event contract.

## Recommended design direction

1. **Universal tracking, optional pay.** For the named three institution types, record class events/counts even when the institution has no per-class pay configured. Keep the per-class earning rule disabled by default. Resolve whether this is a required core tracking capability independent of the plan-gated `hr_payroll` module, or a required capability within that module, before changing module gates.
2. **Count completed class events, not a manually entered monthly total.** Define an eligible event as one actual class occurrence with institution, date, routine/period or approved extra-class source, responsible teacher, event category, completion evidence and source identity. A planned class alone is not completion. Keep a stable event identity so retries or duplicate attendance submissions cannot count it twice. The event producer and authoritative proof remain to be designed; do not infer completion from a payment request.
3. **Separate event categories/rates and proxy attribution.** Institution policy may configure rates for (a) ordinary scheduled classes, (b) approved extra/remedial classes and (c) confirmed proxy/substitute classes. Each category can be off or have an effective-dated BDT rate. Do not assume all categories share one rate. For a completed class taught by a confirmed proxy, attribute that class's per-class earning to the proxy teacher only; the original routine teacher receives no per-class earning for that event. This does not change either teacher's basic salary or fixed benefits. Count the source class event once, and do not add a second generic extra-class payment for it. Whether proxy uses the ordinary class rate or a separately configured proxy rate remains an institution policy choice.
4. **Monthly payroll preview and approval.** For each payee/category/month, calculate eligible event count × the applicable effective-dated rate using exact Decimal arithmetic. Preview must show count, rate, total and source-event references. Authorized reviewer approves the resulting earning adjustment; payroll snapshots the rule version and source fingerprints. Posting is idempotent. No cover transition directly creates or pays an earning. Later event corrections use an audited reversing adjustment under D32/D86.
5. **No new absence/leave/late penalty in this proposal.** Existing absence, approved/unpaid leave and late calculations stay as they are. Not earning an optional per-class amount for an uncompleted class is distinct from imposing an extra salary fine. Do not reduce base salary, deduct for paid leave, or add a late/missed-class fine under this feature. Any such rule requires a separately scoped owner decision and must not double-apply existing attendance deductions.
6. **Other benefits remain distinct.** Phone/internet support should be either a recurring earning component or a receipt-backed reimbursement, not a class event. Home visits/extra-care may be approved event-based allowances or expense reimbursements, with distinct categories, evidence and approver. They are not included in per-class counts unless explicitly defined as a paid class activity.

## Owner choices needed before canonical refinement

- Institution scope: school + college + coaching only, or include `private_batch` too?
- Mandatory behavior: is the recommendation correct that class-event tracking is mandatory but paying a per-class rate is optional and off by default?
- Countable classes: ordinary scheduled classes, extra/remedial classes, proxy classes; which categories earn, and may a scheduled class already included in the basic salary also earn this additional rate?
- Proxy rules: the proxy, not the original routine teacher, receives the per-class earning for that completed confirmed-cover event; base/basic salary is unaffected. Should the proxy inherit the ordinary class rate or use a separate optional proxy rate? Should payout require a recorded period-attendance/class-completion event?
- Rate granularity: one institution-wide rate per category, or rates by teacher/payee group, subject/program/batch or event type? Should a change apply prospectively only?
- Missing/changed class events: who may correct them, what evidence/reason is required, and how must an already-approved payroll be adjusted?
- `hr_payroll` is currently plan-gated. Should mandatory tracking be a core capability independent of payroll-plan access, or must the module gate be amended?

## Formal approval and dependency gates

This feature is outside D95 and D96. An owner-authored, separately committed Change-Request is required before protected canonical edits. It must name the exact scope for module availability, the class-event source/identity, payroll calculation/approval, snapshot/idempotency and any schema/API/export changes. Do not assign a decision identifier here.

Implementation also depends on an accepted routine builder and an authoritative class/period completion record for the three institution types. Proxy compensation additionally depends on the unresolved D95 M3-substitution/M4-teacher-leave milestone blocker and an explicit approved extension to D95/D87's payroll boundary. No task ID/order, migration, module activation, runtime code, payroll change or completion mark is authorized by this proposal.

## Research notes and limits

Search-indexed snippets of the Bangladesh Labour Act Sections 25 and 125-127 indicate that fines and deductions are regulated and that absence deductions are treated separately from fines. The official BDLaws page and official Gazette PDF were discoverable, but the browser/fetch tools could not extract their full text. The reachable MCCI-hosted English Act copy is labeled as current only through 2018. Search summaries also suggest educational-institution/teacher scope may require separate interpretation; those summaries are not relied on as a legal conclusion. No current-law compliance claim or statutory rate/cap is made here.

Sources for owner/legal review:
- Laws of Bangladesh, Bangladesh Labour Act 2006: https://bdlaws.minlaw.gov.bd/act-952.html
- Department of Printing and Publications, Bangladesh Labour Rules 2015 Gazette PDF: https://www.dpp.gov.bd/upload_file/gazettes/14079_83432.pdf
- MCCI-hosted English Bangladesh Labour Act copy (up to 2018; not current-law verification): https://mccibd.org/wp-content/uploads/2021/09/Bangladesh-Labour-Act-2006_English-Upto-2018.pdf

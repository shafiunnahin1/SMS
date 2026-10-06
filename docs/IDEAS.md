# IDEAS (agent-maintained)

Anything useful that is NOT in the current task goes here (a refactor, a rename, a nicer abstraction, a UI change, a missing feature). Do NOT build it (guardrail G16). The owner decides; accepted ideas become a spec change by the owner.

| Date | Task I was doing | Idea | Why it would help | Cost / risk I can see |
|---|---|---|---|---|
| 2026-10-06 | S (S4, spike question 4) | `FeeService::dueLines()` loads payments, structures and periods per student: 19 queries and ~8 ms per student (1000 students = 8.3 s, measured on the dev container). For an all-students dues report / reminder run, load the institution's payments and structures once (keyed by enrollment:category:period) and compute in memory. | Dues report and bulk reminders stay fast at 1000+ students. | A second code path for the same money rule: it must share the exact resolution order and be covered by FeeResolutionTest. |

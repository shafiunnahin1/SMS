<?php

// D187 SUB.1: module-based subscriptions. Every module of an institution's type is on a 30-day free trial; afterwards only the
// modules it pays for stay on. A trial or period that ends unpaid gives 7 days of grace, then the module is read-only (view and
// export, no writes - 402 module_read_only). Data is never deleted. Prices are in module_prices (start at 0; the owner sets them).
return [
    'trial_days' => 30,
    'grace_days' => 7,
    // The foundation is always free (D187 (1); docs/pricing/modules.csv base_included=yes). SMS is billed by usage (D187 (4)).
    'free_modules' => ['students', 'enrollments', 'reports', 'support', 'data_migration', 'sms'],
    // Individual learners buy question-bank items per order (D165), not institution modules (docs/DECISIONS.md 2026-11-02 SUB.1)
    'exempt_types' => ['learners'],
];

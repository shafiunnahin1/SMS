<?php

// Files under app/ that may leave or set the tenant directly (D25). Every entry needs its reason.
// TenancyArchitectureTest fails on any such call in a file not listed here.
return [
    'app/Http/Middleware/TenantMiddleware.php' => 'binds the tenant resolved from the Host - the only request-path binding',
    'app/Support/Tenancy.php' => 'defines Tenancy::as() / withoutTenancy() - the named API everything else must use',
    'app/Traits/BelongsToInstitution.php' => 'defines the named exits anyInstitution() / forInstitution()',
    'app/Traits/BelongsToOptionalInstitution.php' => 'defines anyInstitution() for AuditLog',
    'app/Http/Middleware/PlatformScope.php' => 'Super Admin /super/* group runs inside withoutTenancy() (central host only)',
    'app/Exceptions/TenantNotBoundException.php' => 'only its message text names withoutTenancy() / anyInstitution() as advice; no call',
    'app/Services/Privacy/TenantPurgeService.php' => 'tenant:purge (D27, privacy-and-consent.md 5.3) deletes a whole institution: raw deletes filtered by that institution_id, Super Admin only',
    'app/Console/Commands/TenantPurge.php' => 'the shell form of tenant:purge runs outside any tenant (withoutTenancy) - the service filters by institution_id',
    'app/Services/Privacy/RetentionService.php' => 'audit:trim also ages out the platform\'s own audit rows (institution_id NULL) - anyInstitution() limited to whereNull(institution_id)',
    'app/Support/TenantBulk.php' => 'the only bulk insert/upsert; checks every row belongs to the bound tenant',
    'app/Support/Catalogue.php' => 'defines Catalogue::asPlatform() - the named exit for a question-bank platform write during an institution\'s request (D65)',
    'app/Exceptions/CatalogueAccessException.php' => 'only its message text names Catalogue::asPlatform() as advice; no call',
    'app/Services/QbEarningService.php' => 'QB.10b: books the writer\'s share (platform rows) inside the institution\'s or student\'s sale transaction - Catalogue::asPlatform() (§৪.৫)',
    'app/Services/QuestionBank/QbPaperHeader.php' => 'reads the platform curriculum pivots qb_question_class_level / qb_class_level_subject (no institution_id) for the paper heading\'s class; the question ids come from the tenant\'s own paper',
    'app/Services/StudentService.php' => 'D160: the student ID serial is shared by every institution - reads the highest ID of the day across tenants (anyInstitution, IDs only) under a named lock',
    'app/Console/Commands/StudentNumericIds.php' => 'D160 (3): the owner-run one-time ID conversion goes over every institution (withoutTenancy), each audit row written inside its own tenant',
    'app/Services/Ai/AssistantService.php' => 'D164 (3): the reviewed answer bank holds rows open to every institution (institution_id NULL) - AiAnswerBank::anyInstitution() limited to whereNull(institution_id) or the bound tenant',
];

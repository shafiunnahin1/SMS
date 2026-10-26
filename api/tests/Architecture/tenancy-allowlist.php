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
    'app/Services/Ai/AiReviewService.php' => 'D164 (3): the platform reviewers (central host) read every institution\'s answers de-identified (withoutTenancy) and write each decision inside that answer\'s own tenant (Tenancy::as); the answer bank row is a platform row (institution_id NULL)',
    'app/Console/Commands/AiHelpSeed.php' => 'D166 AI-Q4: the owner-run command adds the platform\'s help articles (institution NULL) as drafts (withoutTenancy; platform rows only)',
    'app/Http/Controllers/Ai/AiHelpArticleController.php' => 'D166 AI-Q4 part 2: the Super Admin panel lists and approves the platform help articles (anyInstitution + whereNull institution_id; central host, tenancy.bypass); an institution admin reads the approved platform articles it may reword (whereNull institution_id) - its own wording stays tenant-scoped',
    'app/Services/Ai/HelpService.php' => 'D166 AI-Q4: reads approved help articles - the platform\'s (institution NULL) and the caller\'s own institution\'s only (anyInstitution with an explicit "NULL or this institution" condition)',
    'app/Http/Controllers/SuperAdmin/QbExamBatchController.php' => 'D165 (3) ST.2: moving a batch\'s exam end date moves the validity of every institution\'s purchases made under it (anyInstitution, one column; central host, tenancy.bypass)',
    'app/Http/Controllers/Ai/AiPlatformController.php' => 'D164 AI-P1.5: the Super Admin\'s usage report counts the assistant\'s rows over every institution (anyInstitution, counts by day only; central host, tenancy.bypass)',
    'app/Console/Commands/AiEvaluate.php' => 'D164 (5): the owner-run quality gate asks as one named institution (Tenancy::as) and counts only',
    'app/Services/Ai/AssistantService.php' => 'D164 (3): the reviewed answer bank holds rows open to every institution (institution_id NULL) - AiAnswerBank::anyInstitution() limited to whereNull(institution_id) or the bound tenant',
];

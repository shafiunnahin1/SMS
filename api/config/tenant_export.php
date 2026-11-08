<?php

// D193 EXP.1 (D38): the one table list for an institution export / import - generated from schema.sql and committed
// (docs/database/tenant-export-map.json; `python3 infra/spec-verify/tenant_export_ref.py . --write`). A deploy that ships only
// api/ must copy that file and point TENANT_EXPORT_MAP at it.
return [
    'map' => env('TENANT_EXPORT_MAP', base_path('../docs/database/tenant-export-map.json')),
    'retention_hours' => 24,          // platform-ops.md section 5.2: the download link lives 24 hours
    'per_day' => 1,                   // one export per institution per 24 hours
];

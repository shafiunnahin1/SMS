<?php

// Import template texts (data-migration.md, student-import.md)
return [
    'instructions_title' => 'Instructions',
    'instructions' => [
        'One student per row on the first sheet. Keep the header row (if yours differs, you can map the columns after uploading).',
        'Required: name, guardian_phone (01XXXXXXXXX), batch (a name or number from the second sheet; several separated by commas in a coaching).',
        'Leave student_id empty to generate one; an ID that already exists is not imported again (skipped).',
        'gender: male / female / other; dates: YYYY-MM-DD.',
        'Upload -> map columns -> check (writes nothing) -> run. A run can be rolled back within 7 days.',
        'A CSV must be UTF-8 (Excel: "CSV UTF-8"). At most 20,000 rows, 10 MB.',
    ],
];

<?php

// D123 (R2.1.3): limits of the JSON/TOON question import (operational, so they live in config)
return [
    'max_file_kb' => (int) env('QB_IMPORT_MAX_FILE_KB', 20480),    // 20 MB a file
    'max_files' => (int) env('QB_IMPORT_MAX_FILES', 10),
    'max_records' => (int) env('QB_IMPORT_MAX_RECORDS', 10000),     // a batch
    'max_pdf_kb' => (int) env('QB_IMPORT_MAX_PDF_KB', 51200),    // D124: 50 MB a PDF (qbank's)
    'max_pdf_pages' => (int) env('QB_IMPORT_MAX_PDF_PAGES', 300),
    'chunk' => (int) env('QB_IMPORT_CHUNK', 500),                   // records a queued chunk parses
];

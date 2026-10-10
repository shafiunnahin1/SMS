<?php

// D50: PDFs are printed by headless Chromium (dompdf breaks Bengali conjuncts and Arabic shaping - Spike S5c).
// The server needs Chromium/Chrome and the Noto Sans Bengali / Noto Sans Arabic fonts (fonts-noto-core on Debian/Ubuntu).
return [
    // Path of the Chrome/Chromium binary; empty = auto-detect (google-chrome / chromium on PATH, the Windows registry, CHROME_PATH)
    'chrome_binary' => env('PDF_CHROME_BINARY') ?: null,
    // Chromium refuses to start as root without this (containers). Leave false where the process runs as a normal user.
    'no_sandbox' => (bool) env('PDF_CHROME_NO_SANDBOX', false),
    'timeout_ms' => (int) env('PDF_TIMEOUT_MS', 30000),
];

<?php

// docs/I18N.md section 6. Release 1 ships bn + en (docs/release/r1-scope.json: "i18n infrastructure (bn + en) only"); `ar` keeps its
// direction entry so the RTL foundation stays in place, and joins `supported` with its content in a later release.
return [
    'supported'        => ['bn', 'en'],
    'platform_locales' => ['bn', 'en'],                      // central host
    'dir'              => ['bn' => 'ltr', 'en' => 'ltr', 'ar' => 'rtl'],
    'fallback'         => ['ar' => ['bn', 'en'], 'bn' => ['en'], 'en' => ['bn']],
];

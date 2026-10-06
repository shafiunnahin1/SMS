<?php

// docs/UI-PACKS.md section 7: each pack and the layouts it fits. Only the packs the frontend registry ships are listed - `classic`
// (phase A) and `mobile` (Spike S5b: one view). `fresh` joins with its component variants in phase B (Step 5.4); until then a preset
// asking for it resolves to classic (ThemeService::packFor, ThemeResolutionTest).
return [
    'classic' => ['label' => ['bn' => 'ক্লাসিক', 'en' => 'Classic'], 'layouts' => ['sidebar-classic', 'sidebar-mini', 'topnav', 'mobile-compact']],
    'mobile'  => ['label' => ['bn' => 'মোবাইল',  'en' => 'Mobile'],  'layouts' => ['mobile-compact']],
];

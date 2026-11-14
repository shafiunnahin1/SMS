<?php

// D214 MAD.4 (docs/modules/madrasa.md section 5): grading presets.
//  - bd_gpa: the SSC/HSC scale of config/grading.php (the default; nothing is stored).
//  - labelled: madrasa-style grade NAMES with EMPTY ranges - the institution fills `min` from its board's circular. The names are a
//    suggestion only and UNVERIFIED (which board uses which name at which range was not checked). Results cannot be entered or
//    published while a range is empty. The last row is the fail grade (code F, as ResultService writes for a failed subject).
return [
    'bd_gpa' => null,
    'labelled' => [
        ['grade' => 'MUM', 'min' => null, 'point' => 0.00, 'label' => ['ar' => 'ممتاز',    'bn' => 'মুমতাজ',          'en' => 'Mumtaz']],
        ['grade' => 'JJ',  'min' => null, 'point' => 0.00, 'label' => ['ar' => 'جيد جدا',  'bn' => 'জায়্যিদ জিদ্দান', 'en' => 'Jayyid Jiddan']],
        ['grade' => 'JAY', 'min' => null, 'point' => 0.00, 'label' => ['ar' => 'جيد',      'bn' => 'জায়্যিদ',         'en' => 'Jayyid']],
        ['grade' => 'MAQ', 'min' => null, 'point' => 0.00, 'label' => ['ar' => 'مقبول',    'bn' => 'মাকবুল',          'en' => 'Maqbul']],
        ['grade' => 'F',   'min' => 0,    'point' => 0.00, 'label' => ['ar' => 'راسب',     'bn' => 'রাসিব',           'en' => 'Rasib']],
    ],
];

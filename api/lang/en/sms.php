<?php

// docs/I18N.md section 7: SMS templates in the RECIPIENT's language; one language per message (mixing scripts makes it Unicode).
return [
    'absent'       => 'Dear guardian, :name was absent from :batch on :date.',
    'fee_received' => 'BDT :amount received. Receipt: :receipt.',
    // D161: result and correction SMS (the recipient's language)
    'result' => ':institution: :name, :exam - total :total/:full (:percentage%), rank :rank.',
    'result_gpa' => 'GPA :gpa.',
    'result_corrected' => ':exam: :name\'s :subject result has been corrected - before: :before, now: :after; total :total, rank :rank. We are sorry for the mistake.',
];

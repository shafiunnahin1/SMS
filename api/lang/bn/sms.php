<?php

// docs/I18N.md section 7: SMS templates in the RECIPIENT's language; one language per message (mixing scripts makes it Unicode).
return [
    'absent'       => 'প্রিয় অভিভাবক, :name :date তারিখে :batch-এ অনুপস্থিত ছিল।',
    'fee_received' => ':amount টাকা গ্রহণ করা হয়েছে। রসিদ: :receipt।',
    // D161: result and correction SMS (the recipient's language)
    'result' => ':institution: :name, :exam - মোট :total/:full (:percentage%), মেধাক্রম :rank।',
    'result_gpa' => 'GPA :gpa।',
    'result_corrected' => ':exam: :name-এর :subject-এর ফলাফল সংশোধন করা হয়েছে - আগে: :before, এখন: :after; মোট :total, মেধাক্রম :rank। ভুলের জন্য আমরা দুঃখিত।',
];

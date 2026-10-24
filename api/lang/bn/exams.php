<?php

// D158 (4): the mark parts an exam subject takes from its linked question paper
return [
    'kinds' => ['mcq' => 'বহুনির্বাচনী', 'cq' => 'সৃজনশীল', 'short' => 'সংক্ষিপ্ত / লিখিত'],
    // D162: in-app notices of the marks submission flow
    'submission' => [
        'submit_title' => 'নম্বর জমা: :subject',
        'submit_body' => ':name ":exam" পরীক্ষার :subject-এর নম্বর জমা দিয়েছেন।',
        'request_title' => 'নম্বর বদলের অনুরোধ: :subject',
        'request_body' => ':name ":exam" পরীক্ষার :subject-এর নম্বর বদলাতে চান। কারণ: :reason',
        'approve_title' => 'অনুরোধ অনুমোদিত: :subject',
        'approve_body' => '":exam" পরীক্ষার :subject-এর নম্বর বদলানো যাবে; বদলে আবার জমা দিন। :note',
        'reject_title' => 'অনুরোধ ফেরত: :subject',
        'reject_body' => '":exam" পরীক্ষার :subject-এর নম্বর বদলের অনুরোধ গ্রহণ হয়নি। :note',
        'reopen_title' => 'খসড়ায় ফেরত: :subject',
        'reopen_body' => '":exam" পরীক্ষার :subject-এর নম্বর আবার খসড়া; ঠিক করে জমা দিন। :note',
    ],
];

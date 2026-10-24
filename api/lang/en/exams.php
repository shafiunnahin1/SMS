<?php

// D158 (4): the mark parts an exam subject takes from its linked question paper
return [
    'kinds' => ['mcq' => 'MCQ', 'cq' => 'Creative', 'short' => 'Short / written'],
    // D162: in-app notices of the marks submission flow
    'submission' => [
        'submit_title' => 'Marks submitted: :subject',
        'submit_body' => ':name submitted the :subject marks of ":exam".',
        'request_title' => 'Update request: :subject',
        'request_body' => ':name asks to update the :subject marks of ":exam". Reason: :reason',
        'approve_title' => 'Request approved: :subject',
        'approve_body' => 'You may update the :subject marks of ":exam"; submit them again after. :note',
        'reject_title' => 'Request declined: :subject',
        'reject_body' => 'The update request for the :subject marks of ":exam" was declined. :note',
        'reopen_title' => 'Returned to draft: :subject',
        'reopen_body' => 'The :subject marks of ":exam" are a draft again; fix and submit. :note',
    ],
];

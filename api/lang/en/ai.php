<?php

// D164 (2): the assistant's fixed answer templates
return [
    'not_found' => 'We found no answer to this in our data. The question went to the reviewers; you will be told when an answer is written.',
    'matches' => 'Questions that match yours:',
    'answer' => 'Answer',
    'explanation' => 'Explanation',
    'locked' => 'Unlock the question to see its answer (today\'s free answers are used up).',
    'chapters' => 'Related chapters',
    'review_title' => 'An answer was updated',
    'review_body' => 'A reviewer corrected an AI assistant answer. See the new answer in your chat.',
    'figure' => '[figure]',   // D166 AI-Q1
    'concepts' => 'Related concepts',   // D166 AI-Q1
    'resources' => 'Related PDFs / books',   // D166 AI-Q1
    'help' => [   // D166 AI-Q4: the software help answer's headings
        'purpose' => 'Purpose',
        'where' => 'Where to go',
        'steps' => 'Step by step',
        'data' => 'What you need',
        'result' => 'After saving',
        'errors' => 'Possible problems and fixes',
        'limits' => 'Your role and module limits',
        'slug_taken' => 'This article already exists.',
        'route_missing' => 'A page or action this article names no longer exists in the system; it cannot be approved.',
        'approved_msg' => 'The article is approved.',
        'not_found' => 'No verified information about this workflow was found in the current system. Please contact your institution\'s admin or support.',
    ],
    'ocr' => [   // D166 (5) AI-Q5
        'unsupported' => 'The text in the photo could not be read reliably. Handwriting and blurred photos are not supported yet; send a clear photo of printed text or type the question.',
        'failed' => 'The photo could not be read. Try again or type the question.',
    ],
];

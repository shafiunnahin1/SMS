<?php

// docs/modules/grading.md "Revision 6.3": SSC/HSC scale by PERCENTAGE (marks / full marks x 100), checked top-down.
// An institution may supply its own in settings.grading_scale.
return ['default_scale' => [
    ['min' => 80, 'grade' => 'A+', 'point' => 5.00], ['min' => 70, 'grade' => 'A',  'point' => 4.00],
    ['min' => 60, 'grade' => 'A-', 'point' => 3.50], ['min' => 50, 'grade' => 'B',  'point' => 3.00],
    ['min' => 40, 'grade' => 'C',  'point' => 2.00], ['min' => 33, 'grade' => 'D',  'point' => 1.00],
    ['min' => 0,  'grade' => 'F',  'point' => 0.00],
]];

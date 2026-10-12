<?php

// config/release.php - changes with every release; docs/release/r1-scope.json is the source of truth and verify.py keeps them equal
return [
    'id'      => 'R1',                                   // R1 < R1.1 < R2 < R3 ... (menu items marked since:'R2' stay hidden until then)
    'modules' => ['students', 'enrollments', 'attendance', 'fees', 'exams', 'sms', 'reports', 'data_migration', 'question_bank', 'quiz'],   // question_bank/quiz: D65/D66 (owner, 2026-10-11)
    'import_kinds' => ['students'],                      // data_migration ships in R1 for student import ONLY: ImportController answers 422 `kind_not_available` for any other kind (teachers, fee_history ... are R1.1)
    'roles'   => ['super_admin', 'admin', 'teacher', 'accountant', 'parent', 'content_writer', 'content_moderator', 'student'],   // D65 (QB.2): platform writers / moderators, central host only; D68: student login for the question-bank portal (other student pages since R1.1)     // LoginController answers 403 `role_not_available` for any role not listed
];

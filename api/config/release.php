<?php

// config/release.php - changes with every release; docs/release/r1-scope.json is the source of truth and verify.py keeps them equal
return [
    'id'      => 'R1',                                   // R1 < R1.1 < R2 < R3 ... (menu items marked since:'R2' stay hidden until then)
    'modules' => ['students', 'enrollments', 'attendance', 'fees', 'exams', 'sms', 'reports', 'data_migration'],
    'import_kinds' => ['students'],                      // data_migration ships in R1 for student import ONLY: ImportController answers 422 `kind_not_available` for any other kind (teachers, fee_history ... are R1.1)
    'roles'   => ['super_admin', 'admin', 'teacher', 'accountant', 'parent'],     // 'student' login ships in R1.1: AuthService answers 403 `role_not_available` for any other role
];

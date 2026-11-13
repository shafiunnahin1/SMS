<?php

// config/release.php - changes with every release; docs/release/r3-scope.json is the source of truth and verify.py keeps them equal
return [
    'id'      => 'R3',                                   // R1 < R1.1 < R2 < R3 ... (menu items marked since:'R2' stay hidden until then)
    'modules' => ['students', 'enrollments', 'attendance', 'fees', 'exams', 'sms', 'reports', 'data_migration', 'question_bank', 'quiz', 'expenses', 'cashbook', 'hr_payroll', 'teacher_attendance', 'inventory', 'accounting', 'donations', 'ai_assistant', 'notices', 'admit_card', 'id_cards', 'routine', 'support', 'result_sheets', 'student_leave', 'period_attendance', 'substitution', 'leads', 'public_site', 'admission_cycle', 'promotion_tc'],   // question_bank/quiz: D65/D66 (owner, 2026-10-11)
    'import_kinds' => ['students', 'teachers', 'fee_structure', 'fee_history', 'results', 'attendance'],   // D193 MIG.1: every data-migration.md kind (R1 shipped students only); ImportController answers 422 `kind_not_available` for any other
    'roles'   => ['super_admin', 'admin', 'teacher', 'accountant', 'parent', 'content_writer', 'content_moderator', 'student', 'institution_staff'],   // D65 (QB.2): platform writers / moderators, central host only; D68: student login for the question-bank portal (other student pages since R1.1)     // LoginController answers 403 `role_not_available` for any role not listed
];

<?php

// docs/AUTHORIZATION.md "Token Strategy & Session Lifetime (Revision 7)" - conservative starting values, change after real use
return [
    'tokens' => [   // minutes: [absolute, idle]
        'super_admin' => [(int) env('TOKEN_ABS_SUPER_ADMIN', 480),   (int) env('TOKEN_IDLE_SUPER_ADMIN', 30)],
        'admin'       => [(int) env('TOKEN_ABS_ADMIN', 720),         (int) env('TOKEN_IDLE_ADMIN', 60)],
        'accountant'  => [(int) env('TOKEN_ABS_ACCOUNTANT', 720),    (int) env('TOKEN_IDLE_ACCOUNTANT', 60)],
        'teacher'     => [(int) env('TOKEN_ABS_TEACHER', 1440),      (int) env('TOKEN_IDLE_TEACHER', 120)],
        'student'     => [(int) env('TOKEN_ABS_STUDENT', 10080),     (int) env('TOKEN_IDLE_STUDENT', 1440)],
        'parent'      => [(int) env('TOKEN_ABS_PARENT', 43200),      (int) env('TOKEN_IDLE_PARENT', 10080)],
    ],
    'max_tokens_per_user' => (int) env('TOKEN_MAX_PER_USER', 5),

    'api_per_minute' => (int) env('API_RATE_LIMIT', 300),    // owner 2026-10-11 (DECISIONS; SECURITY.md said 60)

    'lockout' => ['attempts' => 5, 'minutes' => 30],
    'otp' => ['length' => (int) env('OTP_LENGTH', 6), 'minutes' => (int) env('OTP_EXPIRY_MINUTES', 5)],
    'reset_link_minutes' => 60,
    'check_breached' => (bool) env('PASSWORD_CHECK_BREACHED', false),
];

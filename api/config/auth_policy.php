<?php

// docs/AUTHORIZATION.md "Token Strategy & Session Lifetime (Revision 7)" - conservative starting values, change after real use
return [
    'tokens' => [   // minutes: [absolute, idle]
        'institution_staff' => [(int) env('TOKEN_ABS_INSTITUTION_STAFF', 720), (int) env('TOKEN_IDLE_INSTITUTION_STAFF', 60)],
        'super_admin' => [(int) env('TOKEN_ABS_SUPER_ADMIN', 480),   (int) env('TOKEN_IDLE_SUPER_ADMIN', 30)],
        'admin'       => [(int) env('TOKEN_ABS_ADMIN', 720),         (int) env('TOKEN_IDLE_ADMIN', 60)],
        'accountant'  => [(int) env('TOKEN_ABS_ACCOUNTANT', 720),    (int) env('TOKEN_IDLE_ACCOUNTANT', 60)],
        'teacher'     => [(int) env('TOKEN_ABS_TEACHER', 1440),      (int) env('TOKEN_IDLE_TEACHER', 120)],
        'student'     => [(int) env('TOKEN_ABS_STUDENT', 10080),     (int) env('TOKEN_IDLE_STUDENT', 1440)],
        'parent'      => [(int) env('TOKEN_ABS_PARENT', 43200),      (int) env('TOKEN_IDLE_PARENT', 10080)],
        'content_writer'    => [(int) env('TOKEN_ABS_WRITER', 720),     (int) env('TOKEN_IDLE_WRITER', 60)],      // D65 platform roles: like an admin
        'content_moderator' => [(int) env('TOKEN_ABS_WRITER', 720),     (int) env('TOKEN_IDLE_WRITER', 60)],
    ],
    'max_tokens_per_user' => (int) env('TOKEN_MAX_PER_USER', 5),

    'api_per_minute' => (int) env('API_RATE_LIMIT', 300),    // owner 2026-10-11 (DECISIONS; SECURITY.md said 60)

    'lockout' => ['attempts' => 5, 'minutes' => 30],
    'otp' => ['length' => (int) env('OTP_LENGTH', 6), 'minutes' => (int) env('OTP_EXPIRY_MINUTES', 5)],
    // D90: public exposure remains closed until runtime/security and safe delivery acceptance.
    'activation' => ['public_signup_enabled' => (bool) env('PUBLIC_SIGNUP_ENABLED', false), 'signup_per_hour' => 5,
        'resend_per_minute' => 1, 'resend_contact_per_hour' => 5, 'verify_per_minute' => 5],
    'reset_link_minutes' => 60,
    'check_breached' => (bool) env('PASSWORD_CHECK_BREACHED', false),
];

<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // SMS (docs/modules/notifications.md). Driver `log` writes to the log only (G17: development/testing, and until the
    // gateway contract is confirmed - TODO(OD-sms-gateway)). With an SSL Wireless token set, the default becomes `ssl_wireless`.
    'sms' => [
        'driver' => env('SMS_DRIVER', env('BULKSMSBD_API_KEY') ? 'bulksmsbd' : (env('SSL_WIRELESS_TOKEN') ? 'ssl_wireless' : 'log')),
        'rate' => env('SMS_RATE', '0.40'),          // D56: taka per billable SMS part; Super Admin's platform setting wins
    ],
    // D57: the universal API (BulkSMSBD). The Super Admin's platform setting overrides key and sender (stored encrypted).
    'bulksmsbd' => [
        'url' => env('BULKSMSBD_URL', 'http://bulksmsbd.net/api/smsapi'),
        'api_key' => env('BULKSMSBD_API_KEY'),
        'sender_id' => env('BULKSMSBD_SENDER_ID'),
        'success_codes' => array_map('intval', explode(',', env('BULKSMSBD_SUCCESS_CODES', '202'))),
    ],
    // D58: the platform's bKash tokenized checkout for SMS-wallet recharge (docs/modules/payment-gateways.md "BkashService").
    // Empty credentials = recharge not available (503). The Super Admin can set all of it in the panel (stored encrypted, wins over
    // .env). The sandbox address comes from the owner's merchant account (never guessed - AGENTS.md "What you do not decide").
    'bkash' => [
        'base_url' => env('BKASH_BASE_URL'),            // empty: bKash's sandbox or live address by the sandbox switch (BkashService); the panel wins
        'app_key' => env('BKASH_APP_KEY'),
        'app_secret' => env('BKASH_APP_SECRET'),
        'username' => env('BKASH_USERNAME'),
        'password' => env('BKASH_PASSWORD'),
        'sandbox' => (bool) env('BKASH_SANDBOX', true),
    ],
    'ssl_wireless' => [
        'token' => env('SSL_WIRELESS_TOKEN'),
        'sid' => env('SMS_DEFAULT_SENDER', env('SSL_WIRELESS_SID')),
    ],

    // R2.1.1 / D111: Google sign-in (an existing account with the same verified email only); empty = the button is hidden and the route answers 404
    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
    ],

    // D164 (6) AI-P1.6: the small CPU model (llama.cpp `llama-server`, OpenAI-compatible) that rephrases composed answers.
    // No URL = off: the template answer is shown as it is. Local: http://127.0.0.1:8080; later the VPS's internal address.
    'ai_llm' => [
        'url' => env('AI_LLM_URL'),
        'model' => env('AI_LLM_MODEL', 'qwen3-1.7b-q4'),
        'timeout' => (int) env('AI_LLM_TIMEOUT', 45),
    ],
];

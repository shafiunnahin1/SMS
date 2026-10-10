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
        'driver' => env('SMS_DRIVER', env('SSL_WIRELESS_TOKEN') ? 'ssl_wireless' : 'log'),
        'rate' => env('SMS_RATE', '0.40'),          // D56: taka per billable SMS part; Super Admin's platform setting wins
    ],
    'ssl_wireless' => [
        'token' => env('SSL_WIRELESS_TOKEN'),
        'sid' => env('SMS_DEFAULT_SENDER', env('SSL_WIRELESS_SID')),
    ],

];

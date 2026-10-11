<?php

// Step 9.1 (D64): error and queue alerts (docs/ops/deployment-plan.md "Monitoring"). Nothing is sent until one of the two targets is set.
//   ALERT_WEBHOOK_URL  - a webhook that takes JSON {"text": "..."} (Slack, Discord with /slack, Google Chat, Mattermost, a custom endpoint)
//   ALERT_EMAIL        - comma-separated addresses (uses the app's mailer)
//   ALERT_THROTTLE_MINUTES (10)  - the same alert is sent at most once in this window
//   QUEUE_ALERT_DEPTH (1000)     - docs/ops/performance-benchmarks.md "Queue backlog > 1000 jobs"
return [
    'webhook_url' => env('ALERT_WEBHOOK_URL'),
    'emails' => array_values(array_filter(array_map('trim', explode(',', (string) env('ALERT_EMAIL', ''))))),
    'throttle_minutes' => (int) env('ALERT_THROTTLE_MINUTES', 10),
    'queue_depth' => (int) env('QUEUE_ALERT_DEPTH', 1000),
    'queues' => ['default', 'sms', 'notifications'],
];

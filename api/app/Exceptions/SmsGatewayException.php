<?php

namespace App\Exceptions;

// The SMS provider refused a message on an attempt that is not the last one: the queue retries the job (SendSmsJob::$backoff).
// Nothing is logged or charged for such an attempt; the last attempt logs the failure in sms_logs.
class SmsGatewayException extends \RuntimeException {}

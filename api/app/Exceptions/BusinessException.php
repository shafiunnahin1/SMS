<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;

// A business rule refused the request (holiday date, student not enrolled, SMS credit exhausted ...).
// Rendered in the standard error envelope with a stable code (docs/API-ERRORS.md).
class BusinessException extends \RuntimeException
{
    public function __construct(string $message, public readonly string $errorCode, public readonly int $status = 422)
    {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['success' => false, 'error' => $this->errorCode, 'message' => $this->getMessage()], $this->status);
    }
}

<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Lang;

// A business rule refused the request (holiday date, student not enrolled, SMS credit exhausted ...).
// Rendered in the standard error envelope with a stable code (docs/API-ERRORS.md).
class BusinessException extends \RuntimeException
{
    /** $message is the developer's fallback; the user sees __("errors.{code}", $params) in the request's language */
    public function __construct(string $message, public readonly string $errorCode, public readonly int $status = 422, public readonly array $params = [])
    {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['success' => false, 'error' => $this->errorCode, 'message' => Lang::has("errors.{$this->errorCode}") ? __("errors.{$this->errorCode}", $this->params) : $this->getMessage()], $this->status);
    }
}

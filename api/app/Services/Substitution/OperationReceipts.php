<?php

namespace App\Services\Substitution;

use App\Exceptions\BusinessException;
use App\Models\{LeaveSubstitutionOperation, User};
use App\Support\Tenancy;

// D200 SUBL.2 (docs/API.md D99): the request receipt. The raw Idempotency-Key and the request body are never stored - only
// SHA-256 digests. Same key + same canonical envelope = replay of the stored result (no new version, event, audit or notice);
// same key + another envelope = 409 idempotency_conflict. Callers hold the institution lock and have re-checked access first.
class OperationReceipts
{
    public const FORMAT = 'leave-substitution-v1';
    private const ENVELOPE = ['format', 'action', 'resource', 'context', 'payload', 'expected_versions'];

    public function keyDigest(?string $key): string
    {
        if ($key === null || $key === '' || strlen($key) > 128 || !mb_check_encoding($key, 'UTF-8')) {
            throw new BusinessException('idempotency key', 'idempotency_key_invalid', 422);
        }
        return CanonicalJson::sha256(['leave-substitution-key-v1', $key]);
    }

    /** server-bound context of the actor (department: null outside the staff branch) */
    public function context(User $actor, ?int $departmentId = null): array
    {
        return ['institution_id' => (string) Tenancy::current()->id, 'user_id' => (string) $actor->id, 'department_id' => $departmentId === null ? null : (string) $departmentId];
    }

    public function envelope(string $action, array $resource, array $context, array|\stdClass $payload, array|\stdClass $expectedVersions): array
    {
        return ['format' => self::FORMAT, 'action' => $action, 'resource' => $resource, 'context' => $context, 'payload' => $payload, 'expected_versions' => $expectedVersions];
    }

    public function payloadDigest(array $envelope): string
    {
        $keys = array_keys($envelope);
        if (array_diff($keys, self::ENVELOPE) || array_diff(self::ENVELOPE, $keys) || $envelope['format'] !== self::FORMAT) {
            throw new \InvalidArgumentException('not a leave-substitution-v1 envelope');
        }
        return CanonicalJson::sha256($envelope);
    }

    /** the earlier receipt of this actor and key, or null; another payload under the same key is a conflict */
    public function replay(User $actor, string $keyDigest, string $payloadDigest): ?LeaveSubstitutionOperation
    {
        $prior = LeaveSubstitutionOperation::where('user_id', $actor->id)->where('idempotency_key_sha256', $keyDigest)->first();
        if ($prior && !hash_equals($prior->payload_sha256, $payloadDigest)) throw new BusinessException('same key, different request', 'idempotency_conflict', 409);
        return $prior;
    }

    public function record(User $actor, string $action, string $keyDigest, string $payloadDigest, string $resultCode, int $httpStatus, int $slotCount, ?int $leaveId = null, ?int $departmentId = null): LeaveSubstitutionOperation
    {
        return LeaveSubstitutionOperation::create(['leave_application_id' => $leaveId, 'user_id' => $actor->id, 'department_id' => $departmentId, 'action' => $action,
            'idempotency_key_sha256' => $keyDigest, 'payload_sha256' => $payloadDigest, 'result_code' => $resultCode, 'result_http_status' => $httpStatus, 'result_slot_count' => $slotCount]);
    }

    public function eventKey(LeaveSubstitutionOperation $op, int $slotId): string
    {
        return CanonicalJson::sha256(['leave-substitution-event-v1', (string) $op->institution_id, (string) $op->user_id, (string) $op->id, (string) $slotId]);
    }

    /** the minimal historical result: never today's slot state, never a payload */
    public function manifest(LeaveSubstitutionOperation $op): array
    {
        return ['operation_id' => $op->id, 'leave_id' => $op->leave_application_id, 'result_code' => $op->result_code, 'result_http_status' => $op->result_http_status,
            'result_slot_count' => $op->result_slot_count,
            'events' => $op->events()->orderBy('leave_substitution_slot_id')->get(['id', 'leave_substitution_slot_id', 'version', 'result_status'])
                ->map(fn ($e) => ['event_id' => $e->id, 'slot_id' => $e->leave_substitution_slot_id, 'version' => $e->version, 'result_status' => $e->result_status])->all()];
    }
}

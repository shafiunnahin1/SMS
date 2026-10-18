<?php

namespace Tests\Feature\Sms;

use App\Models\SmsLog;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/TESTING.md "SmsLogTest": GET /sms-logs only the institution's own; cursor pagination, per_page <= 100; teacher/parent 403
class SmsLogTest extends TestCase
{
    use RefreshDatabase;

    public function test_own_logs_only_cursor_paginated_and_role_limited(): void
    {
        $a = $this->makeInstitution('loga');
        $b = $this->makeInstitution('logb');
        Tenancy::as($a, function () { for ($n = 1; $n <= 5; $n++) SmsLog::create(['to_phone' => "0171111111{$n}", 'message' => "a{$n}", 'status' => $n === 5 ? 'failed' : 'sent']); });
        Tenancy::as($b, fn () => SmsLog::create(['to_phone' => '01799999999', 'message' => 'b-secret']));
        $host = $this->hostOf($a);
        $admin = $this->makeUser($a, 'admin');

        $first = $this->api('GET', $host, 'sms-logs?per_page=2', $admin)->assertOk();
        $this->assertSame(['a5', 'a4'], array_column($first->json('data'), 'message'), 'newest first');
        $cursor = $first->json('meta.next_cursor');
        $this->assertNotNull($cursor);
        $second = $this->api('GET', $host, 'sms-logs?per_page=2&cursor=' . urlencode($cursor), $admin)->assertOk();
        $this->assertSame(['a3', 'a2'], array_column($second->json('data'), 'message'));
        $all = $this->api('GET', $host, 'sms-logs?per_page=100', $admin)->assertOk();
        $this->assertCount(5, $all->json('data'));
        $this->assertNull($all->json('meta.next_cursor'));
        $this->assertNotContains('b-secret', array_column($all->json('data'), 'message'));
        $this->assertSame(['a5'], array_column($this->api('GET', $host, 'sms-logs?status=failed', $admin)->json('data'), 'message'));
        $this->api('GET', $host, 'sms-logs?per_page=101', $admin)->assertStatus(422);

        $this->api('GET', $host, 'sms-logs', $this->makeUser($a, 'accountant'))->assertOk();
        $this->api('GET', $host, 'sms-logs', $this->makeUser($a, 'teacher'))->assertForbidden();
        $this->api('GET', $host, 'sms-logs', $this->makeUser($a, 'parent'))->assertForbidden();
    }
}

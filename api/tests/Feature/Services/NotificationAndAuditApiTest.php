<?php

namespace Tests\Feature\Services;

use App\Models\AuditLog;
use App\Notifications\GeneralNotification;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Step 2.6 routes: /notifications (own only) and /audit-logs (admin, own institution only)
class NotificationAndAuditApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_reads_and_marks_only_their_own_notifications(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $me = $this->makeUser($school, 'teacher');
        $other = $this->makeUser($school, 'admin');
        $me->notify(new GeneralNotification('A', 'first', 'notice'));
        $me->notify(new GeneralNotification('B', 'second', 'notice'));
        $other->notify(new GeneralNotification('C', 'not mine', 'notice'));
        $host = $this->hostOf($school);

        $list = $this->api('GET', $host, 'notifications', $me)->assertOk()->assertJsonPath('meta.total', 2)->assertJsonPath('meta.unread', 2);
        $this->assertEqualsCanonicalizing(['first', 'second'], array_column(array_column($list->json('data'), 'data'), 'body'));

        $theirs = $other->notifications()->first()->id;
        $this->api('PATCH', $host, "notifications/{$theirs}/read", $me)->assertNotFound();
        $this->api('PATCH', $host, 'notifications/' . $me->notifications()->first()->id . '/read', $me)->assertOk();
        $this->api('GET', $host, 'notifications', $me)->assertJsonPath('meta.unread', 1);
        $this->api('PATCH', $host, 'notifications/read-all', $me)->assertOk();
        $this->api('GET', $host, 'notifications', $me)->assertJsonPath('meta.unread', 0);
        $this->assertNull($other->notifications()->first()->read_at);
    }

    public function test_admins_see_only_their_institutions_audit_trail_and_others_are_refused(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $other = $this->makeInstitution('other');
        $admin = $this->makeUser($school, 'admin');
        $outsider = $this->makeUser($other, 'admin');
        // audit_logs.user_id is NOT NULL: a row always has an actor (here the user who is the subject)
        $mine = Tenancy::as($school, fn () => AuditLog::record('theme.updated', $admin));
        $theirs = Tenancy::as($other, fn () => AuditLog::record('theme.updated', $outsider));
        $host = $this->hostOf($school);

        $this->api('GET', $host, 'audit-logs', $admin)->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $mine->id);
        $this->api('GET', $host, 'audit-logs?action=nothing', $admin)->assertJsonPath('meta.total', 0);
        $this->api('GET', $host, "audit-logs/{$mine->id}", $admin)->assertOk()->assertJsonPath('data.action', 'theme.updated');
        $this->api('GET', $host, "audit-logs/{$theirs->id}", $admin)->assertNotFound();
        $this->api('GET', $host, 'audit-logs', $this->makeUser($school, 'teacher'))->assertForbidden();
    }
}

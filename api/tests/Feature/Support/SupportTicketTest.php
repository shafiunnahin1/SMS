<?php

namespace Tests\Feature\Support;

use App\Models\{SupportTicket, SupportTicketMessage};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D193 SUP.1 (platform-ops.md section 1.1, SupportVisibilityTest): admin / accountant open tickets with a platform-unique number and
// an SLA due time; the platform answers inside the ticket's tenant; an internal note never reaches the institution; resolved ->
// institution reply reopens, closed is final; rating only after close and once; resolved tickets close by themselves after 7 days.
class SupportTicketTest extends TestCase
{
    use RefreshDatabase;

    private function superAdmin(): \App\Models\User
    {
        return \App\Models\User::create(['institution_id' => null, 'name' => 'SA', 'role' => 'super_admin', 'phone' => '01799000031', 'password' => 'Super-pass-2026', 'is_active' => true]);
    }

    public function test_the_ticket_life_and_what_each_side_sees(): void
    {
        $a = $this->makeInstitution('sup-a');
        $b = $this->makeInstitution('sup-b');
        $admin = $this->makeUser($a, 'admin');
        $acct = $this->makeUser($a, 'accountant');
        $teacher = $this->makeUser($a, 'teacher');
        $bAdmin = $this->makeUser($b, 'admin');
        $sa = $this->superAdmin();
        $ha = $this->hostOf($a);
        $central = 'admin.' . config('tenancy.base_domain');
        $this->travelTo(now()->setTime(10, 0));

        $t1 = $this->api('POST', $ha, 'support/tickets', $admin, ['subject' => 'SMS not sent', 'category' => 'sms', 'priority' => 'high', 'body' => 'Nothing went out today'])
            ->assertCreated()->json('data');
        $t2 = $this->api('POST', $this->hostOf($b), 'support/tickets', $bAdmin, ['subject' => 'Bill', 'category' => 'billing', 'priority' => 'urgent', 'body' => 'Wrong'])->assertCreated()->json('data');
        $this->assertMatchesRegularExpression('/^TKT-\d{4}-00001$/', $t1['ticket_no']);
        $this->assertMatchesRegularExpression('/^TKT-\d{4}-00002$/', $t2['ticket_no'], 'numbers are unique across institutions');
        $this->assertSame(now()->addHours(8)->toDateTimeString(), Tenancy::as($a, fn () => SupportTicket::find($t1['id'])->first_response_due_at->toDateTimeString()));
        $this->assertSame(1, $sa->fresh()->notifications()->count(), 'urgent ticket: the platform is told (in-app)');
        $this->api('POST', $ha, 'support/tickets', $teacher, ['subject' => 'x', 'category' => 'general', 'priority' => 'low', 'body' => 'x'])->assertForbidden();
        $this->api('POST', $ha, 'support/tickets', $admin, ['subject' => 'x', 'category' => 'other', 'priority' => 'low', 'body' => 'x'])->assertStatus(422);
        $this->assertCount(1, $this->api('GET', $ha, 'support/tickets', $acct)->assertOk()->json('data'), 'own institution only');
        $this->api('GET', $ha, "support/tickets/{$t2['id']}", $admin)->assertNotFound();

        // the platform: queue over every institution, overdue flag, internal note, public answer
        $this->travel(9)->hours();
        $queue = collect($this->api('GET', $central, 'super/support/tickets', $sa)->assertOk()->json('data'))->keyBy('id');
        $this->assertTrue($queue[$t1['id']]['overdue']);
        $this->api('POST', $central, "super/support/tickets/{$t1['id']}/messages", $sa, ['body' => 'Gateway key looks wrong', 'is_internal' => true])->assertOk();
        $this->assertSame('open', Tenancy::as($a, fn () => SupportTicket::find($t1['id'])->status), 'an internal note changes nothing');
        $this->api('POST', $central, "super/support/tickets/{$t1['id']}/messages", $sa, ['body' => 'Please check the sender ID'])->assertOk()->assertJsonPath('data.status', 'pending_customer');
        $this->assertCount(3, $this->api('GET', $central, "super/support/tickets/{$t1['id']}", $sa)->json('data.messages'));
        $seen = $this->api('GET', $ha, "support/tickets/{$t1['id']}", $admin)->assertOk()->json('data.messages');
        $this->assertSame(['Nothing went out today', 'Please check the sender ID'], array_column($seen, 'body'), 'the internal note is never returned');
        $this->assertSame(1, $admin->fresh()->notifications()->count());
        $this->assertFalse(collect($this->api('GET', $central, 'super/support/tickets', $sa)->json('data'))->keyBy('id')[$t1['id']]['overdue']);

        // institution reply -> platform's turn; resolve -> reply reopens; close is final; rate once after close
        $this->api('POST', $ha, "support/tickets/{$t1['id']}/messages", $acct, ['body' => 'Done, thanks'])->assertOk()->assertJsonPath('data.status', 'pending_platform');
        $this->api('POST', $central, "super/support/tickets/{$t1['id']}/status", $sa, ['status' => 'resolved'])->assertOk();
        $this->api('POST', $ha, "support/tickets/{$t1['id']}/rate", $admin, ['rating' => 5])->assertStatus(422)->assertJsonPath('error', 'ticket_not_closed');
        $this->api('POST', $ha, "support/tickets/{$t1['id']}/reopen", $admin)->assertOk()->assertJsonPath('data.status', 'pending_platform');
        $this->api('POST', $ha, "support/tickets/{$t1['id']}/reopen", $admin)->assertStatus(422);
        $this->api('POST', $ha, "support/tickets/{$t1['id']}/close", $admin)->assertOk()->assertJsonPath('data.status', 'closed');
        $this->api('POST', $ha, "support/tickets/{$t1['id']}/messages", $admin, ['body' => 'more'])->assertStatus(422)->assertJsonPath('error', 'ticket_closed');
        $this->api('POST', $ha, "support/tickets/{$t1['id']}/rate", $admin, ['rating' => 6])->assertStatus(422);
        $this->api('POST', $ha, "support/tickets/{$t1['id']}/rate", $admin, ['rating' => 4, 'note' => 'Quick'])->assertOk()->assertJsonPath('data.rating', 4);
        $this->api('POST', $ha, "support/tickets/{$t1['id']}/rate", $admin, ['rating' => 1])->assertStatus(422)->assertJsonPath('error', 'ticket_already_rated');
    }

    public function test_resolved_tickets_close_by_themselves_after_seven_days(): void
    {
        $a = $this->makeInstitution('sup-auto');
        $admin = $this->makeUser($a, 'admin');
        $id = $this->api('POST', $this->hostOf($a), 'support/tickets', $admin, ['subject' => 'Q', 'category' => 'how_to', 'priority' => 'low', 'body' => 'How?'])->json('data.id');
        $sa = $this->superAdmin();
        $central = 'admin.' . config('tenancy.base_domain');
        $this->api('POST', $central, "super/support/tickets/{$id}/status", $sa, ['status' => 'resolved'])->assertOk();
        $this->travel(6)->days();
        $this->artisan('support:auto-close')->assertSuccessful();
        $this->assertSame('resolved', Tenancy::as($a, fn () => SupportTicket::find($id)->status));
        $this->travel(2)->days();
        $this->artisan('support:auto-close')->assertSuccessful();
        $this->assertSame('closed', Tenancy::as($a, fn () => SupportTicket::find($id)->status));
        $this->assertSame(1, Tenancy::as($a, fn () => SupportTicketMessage::count()));
    }
}

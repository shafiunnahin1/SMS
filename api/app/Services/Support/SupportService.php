<?php

namespace App\Services\Support;

use App\Exceptions\BusinessException;
use App\Models\{PlatformSetting, SupportTicket, SupportTicketMessage, User};
use App\Notifications\GeneralNotification;
use Illuminate\Support\Facades\DB;

// D193 SUP.1 (platform-ops.md section 1.1): ticket_no TKT-YYYY-nnnnn is unique across the platform - the `counters.ticket` platform
// setting row is locked while the next number is taken. Status: open -> pending_platform <-> pending_customer -> resolved -> closed;
// an institution reply to a resolved ticket reopens it, a closed one stays closed. first_response_due_at = created + the
// priority's hours (`support.sla_hours`; the spec's proposed defaults). An internal (platform) note changes nothing the
// institution sees. Notifications are in-app only (the database channel); e-mail is not built (DECISIONS 2026-11-07 SUP.1).
class SupportService
{
    public const SLA_DEFAULT = ['urgent' => 2, 'high' => 8, 'normal' => 24, 'low' => 48];

    public function open(User $user, array $d): SupportTicket
    {
        return DB::transaction(function () use ($user, $d) {
            $hours = (PlatformSetting::read('support.sla_hours') ?: []) + self::SLA_DEFAULT;
            $ticket = SupportTicket::create(['ticket_no' => $this->nextNumber(), 'subject' => $d['subject'], 'category' => $d['category'], 'priority' => $d['priority'],
                'status' => 'open', 'created_by' => $user->id, 'first_response_due_at' => now()->addHours((int) $hours[$d['priority']])]);
            SupportTicketMessage::create(['ticket_id' => $ticket->id, 'author_type' => 'customer', 'author_id' => $user->id, 'body' => $d['body']]);
            if ($d['priority'] === 'urgent') $this->notifyPlatform($ticket);
            return $ticket;
        });
    }

    /** An institution message: the platform's turn; a resolved ticket opens again, a closed one cannot take messages */
    public function institutionReply(SupportTicket $t, User $user, string $body): SupportTicketMessage
    {
        return DB::transaction(function () use ($t, $user, $body) {
            $t = SupportTicket::whereKey($t->id)->lockForUpdate()->firstOrFail();
            if ($t->status === 'closed') throw new BusinessException('closed', 'ticket_closed', 422);
            $m = SupportTicketMessage::create(['ticket_id' => $t->id, 'author_type' => 'customer', 'author_id' => $user->id, 'body' => $body]);
            $t->update(['status' => 'pending_platform', 'resolved_at' => null]);
            return $m;
        });
    }

    /** A platform message (Super Admin, inside the ticket's own tenant): a public one is the institution's turn */
    public function platformReply(SupportTicket $t, User $user, string $body, bool $internal): SupportTicketMessage
    {
        return DB::transaction(function () use ($t, $user, $body, $internal) {
            $t = SupportTicket::whereKey($t->id)->lockForUpdate()->firstOrFail();
            if ($t->status === 'closed') throw new BusinessException('closed', 'ticket_closed', 422);
            $m = SupportTicketMessage::create(['ticket_id' => $t->id, 'author_type' => 'platform', 'author_id' => $user->id, 'body' => $body, 'is_internal' => $internal]);
            if (!$internal) {
                $t->update(['status' => 'pending_customer', 'first_responded_at' => $t->first_responded_at ?? now()]);
                $creator = User::inTenant()->find($t->created_by);
                $creator?->notify(new GeneralNotification(__('support.reply_title', ['no' => $t->ticket_no]), __('support.reply_body', ['subject' => $t->subject]), 'support_reply', ['ticket_id' => $t->id]));
            }
            return $m;
        });
    }

    public function setStatus(SupportTicket $t, string $status): SupportTicket
    {
        return DB::transaction(function () use ($t, $status) {
            $t = SupportTicket::whereKey($t->id)->lockForUpdate()->firstOrFail();
            if ($t->status === 'closed' && $status !== 'closed') throw new BusinessException('closed', 'ticket_closed', 422);
            $t->update(['status' => $status, 'resolved_at' => $status === 'resolved' ? now() : ($status === 'closed' ? $t->resolved_at : null),
                'closed_at' => $status === 'closed' ? ($t->closed_at ?? now()) : null]);
            return $t;
        });
    }

    /** The institution reopens a resolved ticket (a closed one is final) */
    public function reopen(SupportTicket $t): SupportTicket
    {
        if ($t->status !== 'resolved') throw new BusinessException('not resolved', 'ticket_not_reopenable', 422);
        return $this->setStatus($t, 'pending_platform');
    }

    public function rate(SupportTicket $t, int $rating, ?string $note): SupportTicket
    {
        return DB::transaction(function () use ($t, $rating, $note) {
            $t = SupportTicket::whereKey($t->id)->lockForUpdate()->firstOrFail();
            if ($t->status !== 'closed') throw new BusinessException('not closed', 'ticket_not_closed', 422);
            if ($t->rating !== null) throw new BusinessException('rated', 'ticket_already_rated', 422);
            $t->update(['rating' => $rating, 'rating_note' => $note]);
            return $t;
        });
    }

    private function nextNumber(): string
    {
        PlatformSetting::firstOrCreate(['setting_key' => 'counters.ticket'], ['value' => ['v' => 0]]);
        $row = PlatformSetting::where('setting_key', 'counters.ticket')->lockForUpdate()->first();
        $n = (int) ($row->value['v'] ?? 0) + 1;
        $row->update(['value' => ['v' => $n]]);
        return sprintf('TKT-%s-%05d', now()->format('Y'), $n);
    }

    private function notifyPlatform(SupportTicket $t): void
    {
        $title = __('support.urgent_title', ['no' => $t->ticket_no]);
        foreach (User::platform()->where('role', 'super_admin')->where('is_active', true)->get() as $u) {
            $u->notify(new GeneralNotification($title, $t->subject, 'support_urgent', ['ticket_id' => $t->id, 'institution_id' => $t->institution_id]));
        }
    }
}

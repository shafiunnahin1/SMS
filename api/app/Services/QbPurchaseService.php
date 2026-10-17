<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Institution, Program, QbConcept, QbQuestion, QbResource, QbUnlock, SmsCreditTransaction, Teacher, User};
use App\Support\{Money, Tenancy};
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

// QB.7 (D66, docs/modules/question-bank.md §4.2, §4.4): an institution buys a question's answer (and its use in papers), a concept
// or a resource ONCE, for all its teachers, from its taka wallet (the SMS wallet, ledger type qb_purchase). One transaction: the
// institution row is locked, the unlock is looked for again under the lock (two teachers at once pay once), the teacher's monthly
// cap is checked (422 qb_teacher_cap_reached), the balance (402 wallet_balance_too_low), then the ledger row and the qb_unlocks
// row. The price comes only from QbPricingService; the client never sends an amount (G9). A private-batch tenant is another
// institution, so it buys again (tenant isolation does it).
final class QbPurchaseService
{
    public const MODELS = ['question' => QbQuestion::class, 'concept' => QbConcept::class, 'resource' => QbResource::class];

    public function __construct(private QbPricingService $pricing) {}

    public function item(string $type, int $id): Model
    {
        return (self::MODELS[$type] ?? abort(404))::findOrFail($id);       // the catalogue scope: published only on an institution's host
    }

    /** What this institution would pay now */
    public function quote(string $type, Model $item): array
    {
        $i = Tenancy::current();
        return $this->pricing->quote('institution', $type, $item, $this->buyer($i));
    }

    /** @return array{unlock: QbUnlock, charged: string, already: bool} */
    public function buy(User $user, string $type, int $id): array
    {
        $item = $this->item($type, $id);
        $institution = Tenancy::current();
        if ($have = QbUnlock::where('item_type', $type)->where('item_id', $item->id)->first()) return ['unlock' => $have, 'charged' => '0.00', 'already' => true];

        return DB::transaction(function () use ($user, $type, $item, $institution) {
            $locked = Institution::whereKey($institution->id)->lockForUpdate()->first();
            if ($have = QbUnlock::where('item_type', $type)->where('item_id', $item->id)->first()) return ['unlock' => $have, 'charged' => '0.00', 'already' => true];

            $q = $this->pricing->quote('institution', $type, $item, $this->buyer($locked));
            if ($q['price'] === null) throw new BusinessException('this item has no price yet', 'qb_not_for_sale', 422);
            $price = Money::toPaisa($q['price']);

            if ($price > 0 && in_array($user->role, ['teacher', 'institution_staff'], true)) {   // D101: department staff share the teacher cap
                $cap = $this->cap($user, $locked);
                if ($cap !== null && $this->spentThisMonth($user) + $price > $cap) throw new BusinessException('the monthly question-bank limit is reached', 'qb_teacher_cap_reached', 422);
            }
            $balance = Money::toPaisa((string) $locked->sms_balance);
            if ($price > $balance) throw new BusinessException('the wallet balance is too low', 'wallet_balance_too_low', 402);

            $txn = null;
            if ($price > 0) {
                $locked->forceFill(['sms_balance' => Money::format($balance - $price)])->save();
                $txn = SmsCreditTransaction::create(['type' => 'qb_purchase', 'amount' => Money::format(-$price), 'balance_after' => Money::format($balance - $price),
                    'reference' => "qb:{$type}:{$item->id}", 'created_by' => $user->id]);
            }
            $reason = $price === 0 ? 'free' : ($q['rule_id'] !== null ? 'partial_free' : 'paid');
            $unlock = QbUnlock::create(['item_type' => $type, 'item_id' => $item->id, 'unlocked_by' => $user->id, 'price' => Money::format($price),
                'reason' => $reason, 'qb_price_rule_id' => $q['rule_id'], 'wallet_txn_ref' => $txn ? (string) $txn->id : null]);
            AuditLog::record('qb.bought', $unlock, ['item' => "{$type}:{$item->id}", 'price' => Money::format($price)]);
            app(QbEarningService::class)->credit('institution_unlock', $unlock->id, $type, $item->id, Money::format($price));   // QB.10b: same transaction
            return ['unlock' => $unlock, 'charged' => Money::format($price), 'already' => false];
        });
    }

    /** The teacher's own cap, else the institution default; null = no cap (paisa) */
    public function cap(User $user, Institution $i): ?int
    {
        $own = Teacher::where('user_id', $user->id)->value('qb_monthly_cap');
        $cap = $own ?? (($i->settings ?? [])['qb_teacher_monthly_cap'] ?? null);
        return $cap === null ? null : Money::toPaisa((string) $cap);
    }

    public function spentThisMonth(User $user): int
    {
        return QbUnlock::where('unlocked_by', $user->id)->where('created_at', '>=', now()->startOfMonth())->pluck('price')
            ->sum(fn ($p) => Money::toPaisa((string) $p));
    }

    /** The institution as a buyer: its programs' platform classes, and how often it used a per-buyer rule */
    private function buyer(Institution $i): array
    {
        return ['class_level_ids' => Program::whereNotNull('qb_class_level_id')->pluck('qb_class_level_id')->unique()->values()->all(),
            'uses' => fn (int $ruleId) => QbUnlock::where('qb_price_rule_id', $ruleId)->count()];
    }
}

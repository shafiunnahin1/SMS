<?php

namespace App\Services\QuestionBank;

use App\Models\{Institution, QbStudentOrder, QbStudentPackageAccess, QbStudentScopeAccess, QbStudentUnlock, QbUnlock, QbWriterEarning, QbWriterWallet, QbWriterWalletTxn};
use App\Services\Learner\StudentPackService;
use App\Support\{Money, Tenancy};

// D191 R2.1.8: read-only reconciliation of the question bank's money in exact decimal (integer paisa). It writes nothing.
// Per institution (inside its own Tenancy): a paid student order's amount = the sum of its items' prices; each item was granted
// exactly once with that price; no grant points at an order that is not paid. On the platform: every writer earning's sale amount
// equals the sale it came from (student unlock, quiz package access, institution unlock), and every wallet's balance equals its
// ledger. Findings carry a code and row ids only - never a name, phone or amount (G9).
class QbReconcileService
{
    /** @return list<array{code: string, institution_id: ?int, ids: array}> */
    public function run(): array
    {
        $issues = [];
        $sales = ['student_unlock' => [], 'quiz_package' => [], 'institution_unlock' => []];   // source id => sale paisa
        foreach (Institution::orderBy('id')->cursor() as $institution) {
            Tenancy::as($institution, function () use ($institution, &$issues, &$sales) {
                $this->institution((int) $institution->id, $issues, $sales);
            });
        }
        $this->earnings($sales, $issues);
        $this->wallets($issues);
        return $issues;
    }

    private function institution(int $iid, array &$issues, array &$sales): void
    {
        $add = function (string $code, array $ids) use (&$issues, $iid) { $issues[] = ['code' => $code, 'institution_id' => $iid, 'ids' => $ids]; };
        $unlocks = QbStudentUnlock::whereNotNull('qb_student_order_id')->get(['id', 'qb_student_order_id', 'item_type', 'item_id', 'price'])->groupBy('qb_student_order_id');
        $scopes = QbStudentScopeAccess::whereNotNull('qb_student_order_id')->get()->groupBy('qb_student_order_id');
        $packages = QbStudentPackageAccess::whereNotNull('qb_student_order_id')->get(['id', 'qb_student_order_id', 'qb_quiz_package_id'])->groupBy('qb_student_order_id');
        foreach (QbStudentUnlock::get(['id', 'price']) as $u) $sales['student_unlock'][$u->id] = Money::toPaisa((string) $u->price);
        foreach (QbUnlock::get(['id', 'price']) as $u) $sales['institution_unlock'][$u->id] = Money::toPaisa((string) $u->price);

        $orders = QbStudentOrder::get(['id', 'status', 'amount', 'items'])->keyBy('id');
        foreach ([$unlocks, $scopes, $packages] as $grants) {
            foreach ($grants as $orderId => $rows) {
                if (($orders[$orderId]->status ?? null) !== 'paid') $add('grant_without_paid_order', ['order' => (int) $orderId, 'grants' => $rows->pluck('id')->all()]);
            }
        }
        foreach ($orders as $order) {
            if ($order->status !== 'paid') continue;
            $items = (array) $order->items;
            if (array_sum(array_map(fn ($p) => Money::toPaisa((string) $p['price']), $items)) !== Money::toPaisa((string) $order->amount)) {
                $add('order_amount_differs_from_items', ['order' => $order->id]);
            }
            foreach ($items as $p) {
                $price = Money::toPaisa((string) $p['price']);
                if ($p['item_type'] === 'quiz_package') {
                    $rows = ($packages[$order->id] ?? collect())->where('qb_quiz_package_id', (int) $p['item_id']);
                    foreach ($rows as $r) $sales['quiz_package'][$r->id] = $price;
                    $this->count($rows->count(), $order->id, $p, $add);
                    continue;
                }
                if (isset(StudentPackService::TYPES[$p['item_type']])) {
                    $rows = ($scopes[$order->id] ?? collect())->where('scope', StudentPackService::TYPES[$p['item_type']])
                        ->filter(fn ($r) => collect($p['scope_key'] ?? [])->every(fn ($v, $k) => (int) $r->{$k} === (int) $v));
                    $this->count($rows->count(), $order->id, $p, $add);
                    if ($rows->contains(fn ($r) => Money::toPaisa((string) $r->price) !== $price)) $add('grant_price_differs', ['order' => $order->id, 'grants' => $rows->pluck('id')->all()]);
                    continue;
                }
                $rows = ($unlocks[$order->id] ?? collect())->where('item_type', $p['item_type'])->where('item_id', (int) $p['item_id']);
                $this->count($rows->count(), $order->id, $p, $add);
                if ($rows->contains(fn ($r) => Money::toPaisa((string) $r->price) !== $price)) $add('grant_price_differs', ['order' => $order->id, 'grants' => $rows->pluck('id')->all()]);
            }
        }
    }

    private function count(int $n, int $orderId, array $p, \Closure $add): void
    {
        if ($n === 0) $add('paid_item_not_granted', ['order' => $orderId, 'item_type' => $p['item_type'], 'item_id' => (int) $p['item_id']]);
        if ($n > 1) $add('item_granted_more_than_once', ['order' => $orderId, 'item_type' => $p['item_type'], 'item_id' => (int) $p['item_id']]);
    }

    /** CLI: the catalogue is open outside an institution's request (Catalogue::restricted() is false) */
    private function earnings(array $sales, array &$issues): void
    {
        foreach (QbWriterEarning::orderBy('id')->cursor() as $e) {
            $sale = $sales[$e->source][$e->source_id] ?? null;
            if ($sale === null) { $issues[] = ['code' => 'earning_without_sale', 'institution_id' => null, 'ids' => ['earning' => $e->id]]; continue; }
            if (Money::toPaisa((string) $e->sale_amount) !== $sale) $issues[] = ['code' => 'earning_sale_differs', 'institution_id' => null, 'ids' => ['earning' => $e->id]];
        }
    }

    private function wallets(array &$issues): void
    {
        foreach (QbWriterWallet::orderBy('id')->cursor() as $w) {
            $sum = QbWriterWalletTxn::where('writer_user_id', $w->writer_user_id)->pluck('amount')->sum(fn ($a) => Money::toPaisa((string) $a));
            if ($sum !== Money::toPaisa((string) $w->balance)) $issues[] = ['code' => 'wallet_balance_differs_from_ledger', 'institution_id' => null, 'ids' => ['writer' => $w->writer_user_id]];
        }
    }
}

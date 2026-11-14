<?php

namespace App\Http\Controllers\QuestionBank;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, QbQuizPackage, QbStudentOrder, User};
use App\Services\Wallet\StudentWalletService;
use App\Support\{Money, Tenancy};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

// D218 (6) WAL.4: a student's question-bank order paid from the student's own wallet in ONE transaction - the order row (paid), the
// wallet's purchase row and the unlocks commit together or not at all. Items and prices come from the server (QbStudentController).
class QbStudentWalletOrderController extends Controller
{
    public function __construct(private QbStudentController $orders, private StudentWalletService $wallets) {}

    /** POST /student/qb/wallet-orders {items}: same items as the retired bKash order */
    public function order(Request $request)
    {
        [$free, $paid] = $this->orders->priceItems($request);
        return $this->settle($request->user(), $free, $paid);
    }

    /** POST /student/qb/quiz-packages/{id}/wallet-buy */
    public function package(Request $request, int $id)
    {
        $request->validate(['amount' => 'prohibited', 'price' => 'prohibited']);
        $package = QbQuizPackage::where('is_active', true)->findOrFail($id);
        $q = $this->orders->quote($request->user(), 'quiz_package', $package);
        if ($q['price'] === null) throw new BusinessException('this package has no price yet', 'qb_not_for_sale', 422);
        $item = ['item_type' => 'quiz_package', 'item_id' => $package->id, 'price' => $q['price'],
            'reason' => Money::toPaisa($q['price']) === 0 ? 'free' : ($q['rule_id'] !== null ? 'partial_free' : 'paid')];
        return $item['reason'] === 'free' ? $this->settle($request->user(), [$item], []) : $this->settle($request->user(), [], [$item]);
    }

    private function settle(User $user, array $free, array $paid)
    {
        $result = DB::transaction(function () use ($user, $free, $paid) {
            foreach ($free as $p) QbStudentController::unlock($user, $p, null);
            if (!$paid) return ['paid' => true, 'opened' => count($free), 'ref' => null, 'amount' => '0.00'];
            $paisa = array_sum(array_map(fn ($p) => Money::toPaisa((string) $p['price']), $paid));
            $ref = 'QB' . Tenancy::current()->id . 'W' . strtoupper(Str::random(8));                  // <= 20 chars, [A-Z0-9]
            $order = QbStudentOrder::create(['student_user_id' => $user->id, 'ref' => $ref, 'items' => $paid, 'amount' => Money::format($paisa), 'status' => 'paid']);
            $this->wallets->move($user, 'purchase', -$paisa, 'qb:' . $ref, $user->id);            // wallet_insufficient rolls everything back
            foreach ($paid as $p) QbStudentController::unlock($user, $p, $order->id);
            AuditLog::create(['institution_id' => $order->institution_id, 'user_id' => $user->id, 'action' => 'qb.student_order.paid',
                'model' => 'QbStudentOrder', 'model_id' => $order->id, 'new_data' => ['gateway' => 'wallet'], 'ip_address' => request()->ip()]);
            return ['paid' => true, 'opened' => count($free) + count($paid), 'ref' => $ref, 'amount' => Money::format($paisa)];
        });
        $result['balance'] = (string) $this->wallets->wallet($user)->balance;
        return response()->json(['success' => true, 'data' => $result]);
    }
}

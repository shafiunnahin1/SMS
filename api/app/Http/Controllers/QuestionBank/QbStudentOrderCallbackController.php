<?php

namespace App\Http\Controllers\QuestionBank;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Institution, QbStudentOrder, User};
use App\Services\Billing\BkashService;
use App\Support\{Money, Tenancy};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{Cache, DB};

// QB.9 (D58 pattern): bKash sends the student's browser back here on the CENTRAL host. `ref` finds our own order (institution,
// student, items, amount - all set by the server when the order was made); the payment is executed with bKash and the items open
// only when bKash says Completed for exactly our amount and invoice. Safe to call any number of times: the order moves to paid once.
class QbStudentOrderCallbackController extends Controller
{
    /** GET /qb/student-orders/bkash/callback?ref=&paymentID=&status= */
    public function bkash(Request $request, BkashService $bkash)
    {
        $ref = (string) $request->query('ref');
        $pending = preg_match('/^[A-Z0-9]{1,20}$/', $ref) ? Cache::get("qb_student_order:{$ref}") : null;
        if (!$pending) return response()->json(['success' => false, 'error' => 'not_found', 'message' => __('errors.not_found')], 404);
        $back = fn (string $result) => redirect()->away($pending['return'] . '/student/question-bank?payment=' . $result . '&ref=' . $ref);
        $institution = Institution::findOrFail($pending['institution_id']);

        return Tenancy::as($institution, function () use ($request, $bkash, $ref, $pending, $back) {
            $order = QbStudentOrder::where('ref', $ref)->whereKey($pending['order_id'])->firstOrFail();
            if ($order->status === 'paid') return $back('success');
            if (($request->query('paymentID') ?? $request->query('paymentId')) !== $order->payment_id) return $back('failed');
            if ($request->query('status') !== 'success') {
                $order->update(['status' => 'failed']);
                return $back($request->query('status') === 'cancel' ? 'cancelled' : 'failed');
            }
            $r = $bkash->executePayment($order->payment_id);
            $ok = ($r['transactionStatus'] ?? null) === 'Completed' && ($r['merchantInvoiceNumber'] ?? $ref) === $ref
                && isset($r['amount']) && Money::toPaisa((string) $r['amount']) === Money::toPaisa((string) $order->amount);
            if (!$ok) {
                $order->update(['status' => 'failed']);
                return $back('failed');
            }
            DB::transaction(function () use ($order, $r) {
                $locked = QbStudentOrder::whereKey($order->id)->lockForUpdate()->first();
                if ($locked->status === 'paid') return;                                                   // a parallel callback won
                $locked->update(['status' => 'paid', 'trx_id' => $r['trxID'] ?? null]);
                $student = User::findOrFail($locked->student_user_id);
                foreach ($locked->items as $p) QbStudentController::unlock($student, $p, $locked->id);
                AuditLog::create(['institution_id' => $locked->institution_id, 'user_id' => $locked->student_user_id, 'action' => 'qb.student_order.paid',
                    'model' => 'QbStudentOrder', 'model_id' => $locked->id, 'new_data' => ['gateway' => 'bkash', 'trx_id' => $r['trxID'] ?? null], 'ip_address' => request()->ip()]);
            });
            return $back('success');
        });
    }
}

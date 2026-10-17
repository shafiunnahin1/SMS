<?php
namespace App\Services\Hr;
use App\Exceptions\BusinessException;
use App\Models\{PayrollItem,PayrollRun,StaffMember,Teacher,User};
use App\Services\PdfService;
use App\Support\Tenancy;
use Illuminate\Auth\Access\AuthorizationException;

/** staff-payroll.md §9: a slip exists once the run is approved; it is rendered from the frozen breakdown in the payee's language */
class PayslipService
{
    public function __construct(private SalaryAccess $access) {}

    public function render(User $actor, int $itemId, bool $ownOnly = false): string
    {
        $actor = $this->access->actor($actor, $ownOnly);
        $item = PayrollItem::findOrFail($itemId);
        if ($ownOnly && ($item->payee_type !== 'teacher' || (int) Teacher::where('user_id', $actor->id)->value('id') !== (int) $item->payee_id)) throw new AuthorizationException();
        $run = PayrollRun::findOrFail($item->run_id);
        if (!in_array($run->status, ['approved', 'paid'], true) || !$item->slip_no) throw new BusinessException(__('salary.conflict'), 'payroll_conflict', 409);
        $payee = $item->payee_type === 'teacher' ? Teacher::findOrFail($item->payee_id) : StaffMember::findOrFail($item->payee_id);
        $user = $payee->user_id ? User::where('institution_id', Tenancy::current()->id)->whereKey($payee->user_id)->first() : null;
        $locale = app()->getLocale();
        try {
            app()->setLocale($user?->locale ?? 'bn');
            return app(PdfService::class)->render('pdf.payslip', ['item' => $item, 'run' => $run, 'name' => $user?->name ?? $payee->name,
                'designation' => $payee->designation, 'locale' => app()->getLocale()]);
        } finally { app()->setLocale($locale); }
    }
}

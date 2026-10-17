<?php
namespace App\Services\Hr;
use App\Exceptions\BusinessException;
use App\Models\{SalaryRevision,User};
use App\Services\PdfService;
use App\Support\Tenancy;

class RevisionLetterService
{
    public function render(User $actor,int $id): string
    {
        app(SalaryAccess::class)->actor($actor);
        $revision=SalaryRevision::findOrFail($id);
        if($revision->status!=='applied' || !$revision->letter_no) throw new BusinessException(__('salary.conflict'),'revision_conflict',409);
        $payee=app(SalaryAccess::class)->payee($actor,$revision->payee_type,$revision->payee_id);
        $user=$payee->user_id?User::where('institution_id',Tenancy::current()->id)->whereKey($payee->user_id)->first():null;
        $locale=app()->getLocale();
        try{
            app()->setLocale($user?->locale??'bn');
            return app(PdfService::class)->render('pdf.salary-revision',['revision'=>$revision,'name'=>$user?->name??$payee->name]);
        }finally{app()->setLocale($locale);}
    }
}

<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Http\Requests\PublicSite\PublicAdmissionRequest;
use App\Exceptions\BusinessException;
use App\Models\{AdmissionCycle, AdmissionLead, Batch, Program, User};
use App\Services\Admission\AdmissionCycleService;
use App\Notifications\GeneralNotification;
use App\Services\PublicSite\PublicSiteService;

// D202 PUB.2 (docs/modules/public-website.md "PublicAdmissionController::store"): the public admission form. It becomes an
// admission lead (source `website`, never a referrer). A filled honeypot pretends success and stores nothing; the same phone again
// within 24 hours adds a note to the first lead instead of a second one; the raw IP is never stored (only a keyed hash); admins get
// an in-app notice, and an SMS to the institution's phone when `alert_sms` is on. Throttle: `admission` (per institution and IP).
class PublicAdmissionController extends Controller
{
    public function store(PublicAdmissionRequest $r, PublicSiteService $site)
    {
        $i = app('currentInstitution');
        $s = $site->settings($i);
        abort_unless($s['enabled'] && $s['admission_open'], 404);
        $thanks = $s['admission_message'] ?: __('messages.public_admission_thanks');

        if ($r->filled('website')) return response()->json(['ok' => true, 'message' => $thanks], 201);   // honeypot: looks the same, nothing kept

        $phone = User::normalisePhone($r->input('phone'));
        // D209 ACY.1: a program with an admission cycle takes applications only while that cycle is open (and in its dates)
        $cycle = $this->cycleFor($r->integer('interested_program_id'));
        $lead = AdmissionLead::where('phone', $phone)->where('cycle_id', $cycle?->id)->where('created_at', '>=', now()->subDay())->orderBy('id')->first();
        if ($lead) {
            $again = '[' . now()->format('d/m H:i') . '] ' . __('messages.public_admission_again') . ($r->input('message') ? ': ' . $r->input('message') : '');
            $lead->update(['note' => mb_substr(trim(($lead->note ?? '') . "\n" . $again), 0, 2000)]);
            return response()->json(['ok' => true, 'message' => $thanks, 'application_no' => $lead->application_no]);
        }

        // only THIS institution's public, active program (tenant scope) and an open batch of it, and batches only where they are shown
        $program = $r->integer('interested_program_id') ? Program::where('is_public', 1)->where('is_active', 1)->find($r->integer('interested_program_id')) : null;
        $batch = ($program && $r->integer('interested_batch_id') && in_array($i->institution_type, ['coaching', 'private_batch'], true))
            ? Batch::where('program_id', $program->id)->whereIn('status', ['upcoming', 'running'])->find($r->integer('interested_batch_id')) : null;

        $lead = AdmissionLead::create([
            'name' => $r->input('name'), 'guardian_name' => $r->input('guardian_name') ?: null, 'phone' => $phone, 'email' => $r->input('email') ?: null,
            'current_class' => $r->input('current_class') ?: null, 'message' => $r->input('message') ?: null,
            'interested_program_id' => $program?->id, 'interested_batch_id' => $batch?->id,
            'cycle_id' => $cycle?->id, 'application_no' => $cycle ? app(AdmissionCycleService::class)->newApplicationNo() : null,
            'source' => 'website', 'status' => 'new', 'ip_hash' => hash('sha256', $r->ip() . config('app.key')), 'consented_at' => now(),
        ]);

        foreach (User::inTenant()->where('role', 'admin')->where('is_active', true)->get() as $admin) {
            $admin->notify(new GeneralNotification(__('messages.public_admission_title'), __('messages.public_admission_body', ['name' => $lead->name]), 'admission_lead', ['lead_id' => $lead->id]));
        }
        if ($s['alert_sms'] && $i->phone) {
            app(\App\Services\Sms\SmsEventPolicy::class)->dispatch('admission_new_lead', $i->phone, __('messages.public_admission_sms', ['name' => $lead->name, 'phone' => $lead->phone]));   // D208
        }
        return response()->json(['ok' => true, 'message' => $thanks, 'application_no' => $lead->application_no], 201);
    }

    /** the program's accepting cycle; null when the program has no running cycle; 422 when its cycle is not taking applications */
    private function cycleFor(int $programId): ?AdmissionCycle
    {
        if (!$programId || !app(\App\Services\ModuleGate::class)->allows(app('currentInstitution'), 'admission_cycle')) return null;
        $cycles = AdmissionCycle::where('program_id', $programId)->whereIn('status', ['open', 'testing', 'listing'])->orderByDesc('id')->get();
        if ($cycles->isEmpty()) return null;
        $open = $cycles->first(fn ($c) => $c->accepting());
        if (!$open) throw new BusinessException('applications for this program are closed', 'admission_cycle_closed', 422);
        return $open;
    }
}

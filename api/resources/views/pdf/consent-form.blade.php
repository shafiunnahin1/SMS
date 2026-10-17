@extends('pdf.layout')

{{-- Step 4.2 route, printed with Step 4.8 (D50): the paper consent form a guardian signs (docs/legal/privacy-and-consent.md section 3).
     The text is a draft until a lawyer reviews it. --}}
@section('content')
<style>
  .item { border: 1px solid #cccccc; border-radius: 4px; padding: 8px; margin-bottom: 8px; }
  .box { display: inline-block; width: 12px; height: 12px; border: 1px solid #333333; margin-inline-end: 6px; vertical-align: middle; }
  .signs { margin-top: 40px; display: flex; justify-content: space-between; font-size: 11px; }
  .signs span { border-top: 1px solid #555555; padding-top: 4px; min-width: 180px; text-align: center; }
  .note { color: #777777; font-size: 10px; margin-top: 12px; }
</style>
<h2>{{ __('pdf.consent_form.title') }}</h2>
<p>{{ __('pdf.consent_form.student') }}: <strong>{{ $student->user?->name }}</strong> ({{ $student->student_id }}) · {{ __('pdf.consent_form.guardian_phone') }}: {{ $student->guardian_phone }}</p>
<p>{{ __('pdf.consent_form.intro') }}</p>
@foreach (['data_processing', 'sms', 'photo', 'health_data'] as $type)
  <div class="item"><span class="box"></span><strong>{{ __("pdf.consent_form.types.$type.title") }}</strong>@if ($type === 'data_processing') *@endif
    <div>{{ __("pdf.consent_form.types.$type.body") }}</div></div>
@endforeach
<div class="signs"><span>{{ __('pdf.consent_form.guardian_sign') }}</span><span>{{ __('pdf.consent_form.date') }}</span></div>
<p class="note">{{ __('pdf.consent_form.draft') }}</p>
@endsection

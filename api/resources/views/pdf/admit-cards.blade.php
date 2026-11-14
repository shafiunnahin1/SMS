@extends('pdf.layout')

{{-- D193 ADM.1: admit cards, one A5 page per student (advanced-features.md section 7 layout). Subject rows from exam_subjects. --}}
@section('content')
<style>
  .card { page-break-after: always; } .card:last-child { page-break-after: auto; }
  .card h2 { font-size: 14px; margin: 0 0 8px; }
  .who { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
  .who img.photo { width: 70px; height: 85px; object-fit: cover; border: 1px solid #cccccc; }
  table.sched { width: 100%; border-collapse: collapse; }
  table.sched th, table.sched td { border: 1px solid #cccccc; padding: 3px 5px; text-align: start; }
  table.sched th { background: {{ $theme['primary_color'] }}; color: #ffffff; }
  .foot { margin-top: 10px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px; }
  .foot .sign { border-top: 1px solid #555555; padding-top: 4px; min-width: 120px; text-align: center; }
  .note { font-size: 10px; margin-top: 6px; white-space: pre-line; }
</style>
@forelse ($cards as $c)
<div class="card">
  <h2>{{ __('pdf.admit.title') }} — {{ $exam['name'] }} ({{ $exam['academic_year'] }})</h2>
  <div class="who">
    <div>
      <div>{{ __('pdf.admit.student') }}: <strong>{{ $c['name'] }}</strong>@if (!empty($c['name_alt'])) / <span dir="{{ \App\Support\AltName::dir() }}">{{ $c['name_alt'] }}</span>@endif</div>
      <div>{{ __('pdf.admit.id') }}: {{ $c['code'] }} &nbsp; {{ __('pdf.admit.roll') }}: {{ $c['roll'] ?? '—' }}</div>
      <div>{{ __('pdf.admit.class') }}: {{ $c['class'] }}</div>
    </div>
    @if ($c['photo'])<img class="photo" src="{{ $c['photo'] }}" alt="">@endif
  </div>
  <table class="sched">
    <thead><tr><th>{{ __('pdf.admit.subject') }}</th><th>{{ __('pdf.admit.datetime') }}</th><th>{{ __('pdf.admit.room') }}</th></tr></thead>
    <tbody>
    @foreach ($subjects as $s)
      <tr><td>{{ $s['subject'] }}</td><td>{{ $s['date'] }}@if ($s['start']) {{ $s['start'] }}@if ($s['end'])–{{ $s['end'] }}@endif @endif</td><td>{{ $s['room'] ?? '—' }}</td></tr>
    @endforeach
    </tbody>
  </table>
  @if ($exam['center'])<div style="margin-top:6px">{{ __('pdf.admit.center') }}: {{ $exam['center'] }}</div>@endif
  @if ($exam['instructions'])<div class="note">{{ $exam['instructions'] }}</div>@endif
  <div class="foot"><img src="{{ $c['qr'] }}" width="70" height="70" alt=""><span class="sign">{{ __('pdf.admit.head') }}</span></div>
</div>
@empty
<p>{{ __('pdf.reports.empty') }}</p>
@endforelse
@endsection

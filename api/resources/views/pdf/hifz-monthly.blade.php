@extends('pdf.layout')

{{-- D214 MAD.1: one student's hifz month (docs/modules/madrasa.md 1.5) --}}
@section('content')
<style>
  table.hz { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.hz th, table.hz td { border: 1px solid #cccccc; padding: 4px; text-align: start; }
  table.hz th { background: {{ $theme['primary_color'] }}; color: #ffffff; }
</style>
<h2>{{ __('pdf.hifz.title') }} — {{ $month }}</h2>
<p>{{ $student->user?->name }} ({{ $student->student_id }}) · {{ __('pdf.hifz.progress', ['paras' => $progress['paras'], 'percent' => $progress['percent'], 'pages' => $progress['pages']]) }}</p>
@if ($rows->isEmpty())
<p>{{ __('pdf.reports.empty') }}</p>
@else
<table class="hz">
  <thead><tr><th>{{ __('pdf.hifz.date') }}</th><th>{{ __('pdf.hifz.kind') }}</th><th>{{ __('pdf.hifz.range') }}</th><th>{{ __('pdf.hifz.pages') }}</th><th>{{ __('pdf.hifz.quality') }}</th><th>{{ __('pdf.hifz.mistakes') }}</th><th>{{ __('pdf.hifz.remarks') }}</th></tr></thead>
  <tbody>
  @foreach ($rows as $r)
    <tr><td>{{ $r->record_date->format('d/m/Y') }}</td><td>{{ __('pdf.hifz.kinds.' . $r->kind) }}</td><td dir="ltr">{{ $r->from_surah }}:{{ $r->from_ayah }} – {{ $r->to_surah }}:{{ $r->to_ayah }}</td>
      <td>{{ $r->pages }}</td><td>{{ $r->quality }}</td><td>{{ $r->mistakes }}</td><td>{{ $r->remarks }}</td></tr>
  @endforeach
  </tbody>
</table>
@endif
@endsection

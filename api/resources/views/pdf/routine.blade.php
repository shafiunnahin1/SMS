@extends('pdf.layout')

{{-- D193 RTN.1: the class routine, A4 landscape, every day (routine.md "Print Format") --}}
@section('content')
<style>
  table.rt { width: 100%; border-collapse: collapse; font-size: 10px; }
  table.rt th, table.rt td { border: 1px solid #cccccc; padding: 4px; text-align: start; vertical-align: top; }
  table.rt th { background: {{ $theme['primary_color'] }}; color: #ffffff; }
  .slot { margin-bottom: 3px; } .muted { color: #555555; }
  td.block { background: #e5e5e5; color: #444444; text-align: center; }
</style>
<h2>{{ __('pdf.routine.title') }} — {{ $program }}@if ($batch) — {{ $batch }}@endif</h2>
@if ($times === [])
<p>{{ __('pdf.reports.empty') }}</p>
@else
<table class="rt">
  <thead><tr><th>{{ __('pdf.routine.day') }}</th>@foreach ($times as $t)<th>{{ $t }}</th>@endforeach</tr></thead>
  <tbody>
  @foreach ($days as $d)
    <tr><th>{{ __('pdf.routine.days.' . $d) }}</th>
    @foreach ($times as $t)
      @if (isset($blocks[$d][$t]))<td class="block">{{ $blocks[$d][$t] }}</td>@else
      <td>@foreach ($grid[$d][$t] ?? [] as $s)<div class="slot"><strong>{{ $s['subject'] }}</strong>@if ($s['batch'] && !$batch) ({{ $s['batch'] }})@endif<br><span class="muted">{{ $s['teacher'] }}@if ($s['room_no']) · {{ $s['room_no'] }}@endif</span></div>@endforeach</td>@endif
    @endforeach
    </tr>
  @endforeach
  </tbody>
</table>
@endif
@endsection

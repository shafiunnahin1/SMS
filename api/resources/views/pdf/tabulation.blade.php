@extends('pdf.layout')

{{-- D197 AAD.2: the tabulation sheet - landscape, a row per student by roll, per subject the weighted percentage and grade,
     then total, GPA, position, result; signature boxes; the header row repeats on every page (thead). --}}
@section('content')
<style>
  table.tb { width: 100%; border-collapse: collapse; font-size: 9px; }
  table.tb th, table.tb td { border: 1px solid #cccccc; padding: 2px 3px; text-align: center; }
  table.tb th { background: {{ $theme['primary_color'] }}; color: #ffffff; }
  table.tb thead { display: table-header-group; }
  table.tb tr { page-break-inside: avoid; }
  td.name { text-align: start; }
  .fail { font-weight: bold; }
  .signs { margin-top: 36px; display: flex; justify-content: space-between; font-size: 11px; }
  .signs span { border-top: 1px solid #555555; padding-top: 4px; min-width: 160px; text-align: center; }
</style>
<h2>{{ __('pdf.tabulation.title') }} — {{ $sheet->name }} (v{{ $sheet->version }}) — {{ $sheet->program?->name }}@if ($sheet->batch) — {{ $sheet->batch->name }}@endif</h2>
<table class="tb">
  <thead>
    <tr><th rowspan="2">{{ __('pdf.tabulation.roll') }}</th><th rowspan="2">{{ __('pdf.tabulation.name') }}</th>
      @foreach ($subjects as $name)<th colspan="2">{{ $name }}</th>@endforeach
      <th rowspan="2">{{ __('pdf.tabulation.total') }}</th><th rowspan="2">GPA</th><th rowspan="2">{{ __('pdf.tabulation.position') }}</th><th rowspan="2">{{ __('pdf.tabulation.result') }}</th></tr>
    <tr>@foreach ($subjects as $name)<th>%</th><th>{{ __('pdf.tabulation.grade') }}</th>@endforeach</tr>
  </thead>
  <tbody>
  @forelse ($rows as $r)
    <tr @class(['fail' => !$r['is_pass']])>
      <td>{{ $r['roll'] ?? '—' }}</td><td class="name">{{ $r['name'] }} <br>{{ $r['code'] }}</td>
      @foreach ($subjects as $sid => $name)<td>{{ $r['subjects'][$sid]['weighted'] ?? '—' }}</td><td>{{ $r['subjects'][$sid]['grade'] ?? '—' }}</td>@endforeach
      <td>{{ $r['total'] ?? '—' }}</td><td>{{ $r['gpa'] ?? '—' }}</td><td>{{ $r['position'] ?? '—' }}</td>
      <td>{{ $r['is_pass'] ? __('pdf.tabulation.passed') : __('pdf.tabulation.failed') }}</td>
    </tr>
  @empty
    <tr><td colspan="{{ 6 + 2 * count($subjects) }}">{{ __('pdf.reports.empty') }}</td></tr>
  @endforelse
  </tbody>
</table>
<div class="signs"><span>{{ __('pdf.tabulation.class_teacher') }}</span><span>{{ __('pdf.tabulation.head') }}</span></div>
@endsection

@extends('pdf.layout')

{{-- D161 (1): an exam's merit list (D158 (2)) as printed - rank, student, roll, batch, total and percentage over all the exam's full marks;
     a tie shares the rank; a student without marks is listed last without a rank. Printed by headless Chromium (D50). --}}
@section('content')
@php($n = fn ($v) => $v === null ? '—' : rtrim(rtrim(number_format((float) $v, 2, '.', ''), '0'), '.'))
<style>
  table.merit { width: 100%; border-collapse: collapse; }
  table.merit th, table.merit td { border: 1px solid #cccccc; padding: 4px 6px; text-align: start; }
  table.merit th { background: {{ $theme['primary_color'] }}; color: #ffffff; }
  table.merit td.num, table.merit th.num { text-align: end; }
</style>
<h2>{{ __('pdf.merit.title') }} — {{ $exam->name }} ({{ $exam->academic_year }})</h2>
<p>{{ $exam->program?->name }}@if ($batchName) — {{ $batchName }}@endif · {{ __('pdf.merit.full') }}: {{ $n($merit['full_marks']) }}</p>
<table class="merit">
  <thead><tr><th class="num">{{ __('pdf.merit.rank') }}</th><th>{{ __('pdf.merit.student') }}</th><th>{{ __('pdf.merit.id') }}</th><th class="num">{{ __('pdf.merit.roll') }}</th>
    <th>{{ __('pdf.merit.batch') }}</th><th class="num">{{ __('pdf.merit.total') }}</th><th class="num">%</th></tr></thead>
  <tbody>
  @foreach ($merit['rows'] as $r)
    <tr><td class="num">{{ $r['rank'] ?? '—' }}</td><td>{{ $r['name'] }}</td><td>{{ $r['code'] }}</td><td class="num">{{ $r['roll_no'] ?? '' }}</td>
      <td>{{ $r['batch'] ?? '' }}</td><td class="num">{{ $n($r['total']) }}</td><td class="num">{{ $n($r['percentage']) }}</td></tr>
  @endforeach
  </tbody>
</table>
@endsection

@extends('pdf.layout')

{{-- Marksheet (Step 4.5): one exam of one student; grades come from ResultService (percentage of each subject's own full marks,
     every part must pass). GPA only when settings.use_gpa. Printed by headless Chromium (D50). --}}
@section('content')
@php($n = fn ($v) => $v === null ? '—' : rtrim(rtrim(number_format((float) $v, 2, '.', ''), '0'), '.'))
<style>
  .meta { width: 100%; margin-bottom: 8px; } .meta td { padding: 2px 8px 2px 0; }
  table.marks { width: 100%; border-collapse: collapse; }
  table.marks th, table.marks td { border: 1px solid #cccccc; padding: 4px 6px; text-align: start; }
  table.marks th { background: {{ $theme['primary_color'] }}; color: #ffffff; }
  table.marks td.num, table.marks th.num { text-align: end; }
  .parts { font-size: 10px; color: #555555; }
  .fail { font-weight: bold; }
  .summary { margin-top: 10px; display: flex; gap: 24px; font-size: 13px; }
  .signs { margin-top: 48px; display: flex; justify-content: space-between; font-size: 11px; }
  .signs span { border-top: 1px solid #555555; padding-top: 4px; min-width: 140px; text-align: center; }
</style>
<h2>{{ __('pdf.marksheet.title') }} — {{ $sheet['exam']['name'] }} ({{ $sheet['exam']['academic_year'] }})</h2>
<table class="meta">
  <tr><td>{{ __('pdf.marksheet.student') }}</td><td><strong>{{ $sheet['student']['name'] }}</strong> ({{ $sheet['student']['student_id'] }})</td>
      <td>{{ __('pdf.marksheet.class') }}</td><td>{{ $sheet['student']['program'] }}@if ($sheet['student']['batch']) — {{ $sheet['student']['batch'] }}@endif</td></tr>
  <tr><td>{{ __('pdf.marksheet.roll') }}</td><td>{{ $sheet['student']['roll_no'] ?? '—' }}</td>
      <td>{{ __('pdf.marksheet.issued') }}</td><td>{{ now()->format('d/m/Y') }}</td></tr>
</table>
<table class="marks">
  <thead><tr><th>{{ __('pdf.marksheet.subject') }}</th><th class="num">{{ __('pdf.marksheet.full') }}</th><th class="num">{{ __('pdf.marksheet.obtained') }}</th>
    @if ($sheet['use_gpa'])<th>{{ __('pdf.marksheet.grade') }}</th><th class="num">{{ __('pdf.marksheet.point') }}</th>@else<th class="num">%</th>@endif</tr></thead>
  <tbody>
  @foreach ($sheet['subjects'] as $s)
    <tr @class(['fail' => $s['is_pass'] === false])>
      <td>{{ $s['subject'] }}
        @if ($s['components'] && $s['component_marks'])
          <div class="parts">@foreach ($s['components'] as $c){{ $c['label'] }}: {{ $n($s['component_marks'][$c['key']] ?? null) }}/{{ $n($c['full']) }}@if (!$loop->last) · @endif @endforeach</div>
        @endif
      </td>
      <td class="num">{{ $n($s['full_marks']) }}</td>
      <td class="num">{{ $s['is_absent'] ? __('pdf.marksheet.absent') : $n($s['marks_obtained']) }}</td>
      @if ($sheet['use_gpa'])<td>{{ $s['grade'] ?? '—' }}</td><td class="num">{{ $s['grade_point'] === null ? '—' : number_format((float) $s['grade_point'], 2) }}</td>
      @else<td class="num">{{ $n($s['percentage']) }}</td>@endif
    </tr>
  @endforeach
  <tr><td><strong>{{ __('pdf.marksheet.total') }}</strong></td><td class="num"><strong>{{ $n($sheet['total']['full_marks']) }}</strong></td>
    <td class="num"><strong>{{ $n($sheet['total']['obtained']) }}</strong></td><td colspan="{{ $sheet['use_gpa'] ? 2 : 1 }}"></td></tr>
  </tbody>
</table>
<div class="summary">
  <span>{{ __('pdf.marksheet.percentage') }}: <strong>{{ $n($sheet['total']['percentage']) }}%</strong></span>
  @if ($sheet['use_gpa'])<span>GPA: <strong>{{ $sheet['total']['gpa'] === null ? '—' : number_format($sheet['total']['gpa'], 2) }}</strong></span>@endif
  <span>{{ __('pdf.marksheet.result') }}: <strong>{{ $sheet['total']['is_pass'] === null ? '—' : ($sheet['total']['is_pass'] ? __('pdf.marksheet.passed') : __('pdf.marksheet.failed')) }}</strong></span>
</div>
<div class="signs"><span>{{ __('pdf.marksheet.class_teacher') }}</span><span>{{ __('pdf.marksheet.head') }}</span><span>{{ __('pdf.marksheet.guardian') }}</span></div>
@endsection

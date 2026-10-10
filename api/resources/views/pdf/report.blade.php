@extends('pdf.layout')

{{-- Step 4.8: any R1 report as a table (ReportService) - title, filters, headings, rows, total. --}}
@section('content')
<style>
  table.r { width: 100%; border-collapse: collapse; @if (!empty($report['compact'])) font-size: 9px; @endif }
  table.r th, table.r td { border: 1px solid #cccccc; padding: {{ !empty($report['compact']) ? '2px' : '4px 6px' }}; text-align: start; vertical-align: top; }
  table.r th { background: {{ $theme['primary_color'] }}; color: #ffffff; }
  table.r tr.total td { font-weight: bold; }
  .filters { color: #555555; margin: 0 0 8px; }
  .printed { color: #777777; font-size: 10px; margin-top: 8px; }
</style>
<h2>{{ $report['title'] }}</h2>
<p class="filters">{{ $report['filters'] }}</p>
<table class="r">
  <thead><tr>@foreach ($report['headings'] as $h)<th>{{ $h }}</th>@endforeach</tr></thead>
  <tbody>
  @forelse ($report['rows'] as $row)
    <tr>@foreach ($row as $cell)<td>{{ $cell }}</td>@endforeach</tr>
  @empty
    <tr><td colspan="{{ count($report['headings']) }}">{{ __('pdf.reports.empty') }}</td></tr>
  @endforelse
  @if (!empty($report['total']))
    <tr class="total">@foreach ($report['total'] as $cell)<td>{{ $cell }}</td>@endforeach @for ($k = count($report['total']); $k < count($report['headings']); $k++)<td></td>@endfor</tr>
  @endif
  </tbody>
</table>
<p class="printed">{{ __('pdf.reports.printed') }}: {{ now()->format('d/m/Y H:i') }}</p>
@endsection

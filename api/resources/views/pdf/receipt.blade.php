@extends('pdf.layout')

{{-- Money receipt (Step 4.4 / Spike S4). The PDF engine and Bengali/Arabic shaping are decided in Spike S5c. --}}
@section('content')
<style>
  .meta td { padding: 2px 8px 2px 0; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 10px; }
  table.lines th, table.lines td { border: 1px solid #cccccc; padding: 4px 6px; text-align: start; }
  table.lines td.num, table.lines th.num { text-align: end; }
  .total td { font-weight: bold; }
</style>
<h2>{{ __('pdf.receipt.title') }}</h2>
<table class="meta">
  <tr><td>{{ __('pdf.receipt.no') }}</td><td><strong>{{ $receipt['receipt_no'] }}</strong></td></tr>
  <tr><td>{{ __('pdf.receipt.date') }}</td><td>{{ \Illuminate\Support\Carbon::parse($receipt['paid_at'])->format('d/m/Y') }}</td></tr>
  <tr><td>{{ __('pdf.receipt.student') }}</td><td>{{ $receipt['student']['name'] }} ({{ $receipt['student']['student_id'] }})</td></tr>
  <tr><td>{{ __('pdf.receipt.method') }}</td><td>{{ $receipt['payment_method'] }}</td></tr>
</table>
<table class="lines">
  <thead><tr><th>#</th><th>{{ __('pdf.receipt.item') }}</th><th>{{ __('pdf.receipt.period') }}</th><th class="num">{{ __('pdf.receipt.paid') }}</th></tr></thead>
  <tbody>
  @foreach ($receipt['lines'] as $l)
    <tr><td>{{ $l['line_no'] }}</td><td>{{ $l['category'] }}@if ($l['batch']) — {{ $l['batch'] }}@endif</td><td>{{ $l['period'] }}</td><td class="num">{{ $l['paid_amount'] }}</td></tr>
  @endforeach
  <tr class="total"><td colspan="3">{{ __('pdf.receipt.total') }}</td><td class="num">{{ $receipt['total'] }}</td></tr>
  </tbody>
</table>
@endsection

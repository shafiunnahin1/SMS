@extends('pdf.layout')

{{-- Money receipt (Step 4.4): headless Chromium (D50); the institution's logo + colour from the layout, the QR = primaryUrl() --}}
@section('content')
<style>
  .meta td { padding: 2px 8px 2px 0; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 10px; }
  table.lines th, table.lines td { border: 1px solid #cccccc; padding: 4px 6px; text-align: start; }
  table.lines td.num, table.lines th.num { text-align: end; }
  table.lines th { background: {{ $theme['primary_color'] }}; color: #ffffff; }
  .total td { font-weight: bold; }
  .qr { margin-top: 14px; display: flex; gap: 10px; align-items: center; font-size: 10px; color: #555555; }
</style>
<h2>{{ __('pdf.receipt.title') }}</h2>
<table class="meta">
  <tr><td>{{ __('pdf.receipt.no') }}</td><td><strong>{{ $receipt['receipt_no'] }}</strong></td></tr>
  <tr><td>{{ __('pdf.receipt.date') }}</td><td>{{ \Illuminate\Support\Carbon::parse($receipt['paid_at'])->format('d/m/Y') }}</td></tr>
  <tr><td>{{ __('pdf.receipt.student') }}</td><td>{{ $receipt['student']['name'] }} ({{ $receipt['student']['student_id'] }})</td></tr>
  <tr><td>{{ __('pdf.receipt.method') }}</td><td>{{ Lang::has('pdf.receipt.methods.' . $receipt['payment_method']) ? __('pdf.receipt.methods.' . $receipt['payment_method']) : $receipt['payment_method'] }}</td></tr>
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
@isset($qr)
<div class="qr"><img src="{{ $qr }}" width="80" height="80" alt="QR"><span dir="ltr">{{ $qrUrl }}</span></div>
@endisset
@endsection

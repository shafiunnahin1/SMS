@extends('pdf.layout')
@section('content')
<h2>{{ $run->kind === 'bonus' ? __('salary.bonus_payslip') : __('salary.payslip') }}</h2>
<p>{{ $item->slip_no }} · {{ $name }}@if($designation) · {{ $designation }}@endif · {{ __('salary.month') }} {{ $run->month }}</p>
<table>
<tr><th>{{ __('salary.earnings') }}</th><th></th></tr>
@foreach($item->breakdown as $line)@if($line['type'] === 'earning')
<tr><td>{{ $line['name'][$locale] ?? $line['name']['en'] ?? $line['code'] }}</td><td>{{ $line['amount'] }}</td></tr>
@endif @endforeach
<tr><th>{{ __('salary.deductions') }}</th><th></th></tr>
@foreach($item->breakdown as $line)@if($line['type'] === 'deduction')
<tr><td>{{ $line['name'][$locale] ?? $line['name']['en'] ?? $line['code'] }}</td><td>{{ $line['amount'] }}</td></tr>
@endif @endforeach
<tr><th>{{ __('salary.net') }}</th><th>{{ $item->net }}</th></tr>
</table>
<p>{{ __('salary.paid_days') }}: {{ $item->paid_days }} · {{ __('salary.absent_days') }}: {{ $item->absent_days }} · {{ __('salary.leave_days') }}: {{ $item->lwp_days }}@if($item->payment_method) · {{ __('salary.method') }}: {{ $item->payment_method }}@endif</p>
@endsection

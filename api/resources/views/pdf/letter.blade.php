{{-- D210 LTR.1: an official letter - memo number and dates in Bangla digits, the date line in both calendars --}}
@extends('pdf.layout')
@section('content')
<style>
  .memo { display: table; width: 100%; font-size: 12px; margin-bottom: 18px; }
  .memo span { display: table-cell; }
  .memo .date { text-align: right; }
  .to { font-size: 13px; line-height: 1.7; white-space: pre-line; margin-bottom: 12px; }
  .subject { font-size: 13px; font-weight: bold; margin-bottom: 14px; }
  .body { font-size: 14px; line-height: 1.9; text-align: justify; white-space: pre-line; }
  .sign { margin-top: 60px; text-align: right; font-size: 13px; line-height: 1.6; }
  .revoked { color: #b91c1c; font-weight: bold; text-align: center; border: 2px solid #b91c1c; padding: 4px; margin-bottom: 10px; }
</style>
@if ($l->status === 'cancelled')<div class="revoked">বাতিল</div>@endif
<div class="memo"><span>স্মারক নং: {{ $memo_bn }}</span><span class="date">তারিখ: {{ $date_line }}</span></div>
<div class="to">বরাবর,
{{ $l->recipient }}</div>
<div class="subject">বিষয়: {{ $l->subject }}</div>
<div class="body">{{ $l->body }}</div>
<div class="sign">@if ($signer){{ $signer }}<br>@endif প্রধান শিক্ষক / অধ্যক্ষ<br>{{ $institution?->name }}</div>
@endsection

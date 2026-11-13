{{-- D210 CERT.1: a certificate (prottayon potro, prosongsha potro, ...) - memo number and dates in Bangla digits, the date line in both
     calendars, and a QR to the public check --}}
@extends('pdf.layout')
@section('content')
<style>
  .memo { display: table; width: 100%; font-size: 12px; margin-bottom: 18px; }
  .memo span { display: table-cell; }
  .memo .date { text-align: right; }
  .title { text-align: center; font-size: 20px; font-weight: bold; margin: 8px 0 18px; text-decoration: underline; }
  .body { font-size: 14px; line-height: 2; text-align: justify; white-space: pre-line; }
  .foot { display: table; width: 100%; margin-top: 60px; }
  .foot > div { display: table-cell; vertical-align: bottom; }
  .sign { text-align: right; font-size: 13px; }
  .qr { font-size: 9px; color: #555555; }
  .revoked { color: #b91c1c; font-weight: bold; text-align: center; border: 2px solid #b91c1c; padding: 4px; margin-bottom: 10px; }
</style>
@if ($c->revoked_at)<div class="revoked">বাতিল</div>@endif
<div class="memo"><span>স্মারক নং: {{ $memo_bn }}</span><span class="date">তারিখ: {{ $date_line }}</span></div>
<div class="title">{{ $c->title }}</div>
<div class="body">{{ $c->description }}</div>
<div class="foot">
  <div class="qr">
    @if ($qr)
      <img src="{{ $qr }}" width="80" height="80" alt="QR"><br>
      <span dir="ltr">{{ $verify_url }}</span>
    @endif
  </div>
  <div class="sign">প্রধান শিক্ষক / অধ্যক্ষ<br>{{ $institution?->name }}</div>
</div>
@endsection

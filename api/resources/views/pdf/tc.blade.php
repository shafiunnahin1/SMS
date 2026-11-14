{{-- D210 PTC.1: the transfer certificate (ছাড়পত্র) - memo number and dates in Bangla digits, the date line in both calendars --}}
@extends('pdf.layout')
@section('content')
<style>
  .memo { display: table; width: 100%; font-size: 12px; margin-bottom: 18px; }
  .memo span { display: table-cell; }
  .memo .date { text-align: right; }
  .title { text-align: center; font-size: 20px; font-weight: bold; margin: 8px 0 18px; text-decoration: underline; }
  .body { font-size: 14px; line-height: 2; text-align: justify; }
  .sign { margin-top: 70px; text-align: right; font-size: 13px; }
  .revoked { color: #b91c1c; font-weight: bold; text-align: center; border: 2px solid #b91c1c; padding: 4px; margin-bottom: 10px; }
</style>
@if ($tc->revoked_at)<div class="revoked">বাতিল</div>@endif
<div class="memo"><span>স্মারক নং: {{ $memo_bn }}</span><span class="date">তারিখ: {{ $date_line }}</span></div>
<div class="title">ছাড়পত্র</div>
<div class="body">
  @php
    $who = $student->user?->name;
    if ($altWho = \App\Support\AltName::of($student->user)) $who .= ' (' . $altWho . ')';   // D214 MAD.3
    if ($student->father_name) $who .= ', পিতা: ' . $student->father_name;
    if ($student->mother_name) $who .= ', মাতা: ' . $student->mother_name;
    $span = trim(($from_bn ? $from_bn . ' তারিখ হতে ' : '') . ($to_bn ? $to_bn . ' তারিখ পর্যন্ত' : ''));
  @endphp
  এই মর্মে প্রত্যয়ন করা যাচ্ছে যে, {{ $who }}, অত্র প্রতিষ্ঠানে {{ $span }} অধ্যয়ন করেছে।
  @if ($tc->last_class)
    সর্বশেষ শ্রেণি: {{ $tc->last_class }}।
  @endif
  তার আচরণ: {{ $tc->conduct }}।
  @if ($tc->reason)
    প্রতিষ্ঠান ত্যাগের কারণ: {{ $tc->reason }}।
  @endif
  আমি তার সর্বাঙ্গীণ মঙ্গল কামনা করি।
</div>
<div class="sign">প্রধান শিক্ষক / অধ্যক্ষ<br>{{ $institution?->name }}</div>
@endsection

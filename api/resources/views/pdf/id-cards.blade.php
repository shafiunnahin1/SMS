@extends('pdf.layout')

{{-- D193 ADM.1: student ID cards - one A6 card, or 6 per A4 page (2 x 3) in bulk (extended-features.md section 13). --}}
@section('content')
<style>
  .grid { display: grid; grid-template-columns: {{ $single ? '1fr' : '1fr 1fr' }}; gap: 6mm; }
  .idc { border: 1px solid #cccccc; border-radius: 6px; padding: 8px; page-break-inside: avoid; display: flex; gap: 8px; }
  .idc .bar { color: {{ $theme['primary_color'] }}; font-weight: bold; font-size: 11px; margin-bottom: 4px; }
  .idc img.photo { width: 64px; height: 78px; object-fit: cover; border: 1px solid #cccccc; }
  .idc .info { flex: 1; font-size: 11px; line-height: 1.5; }
  .brk { page-break-after: always; grid-column: 1 / -1; height: 0; }
</style>
<div class="grid">
@forelse ($cards as $c)
  <div class="idc">
    @if ($c['photo'])<img class="photo" src="{{ $c['photo'] }}" alt="">@endif
    <div class="info">
      <div class="bar">{{ __('pdf.idcard.title') }}</div>
      <div><strong>{{ $c['name'] }}</strong></div>
      @if (!empty($c['name_alt']))<div dir="{{ \App\Support\AltName::dir() }}">{{ $c['name_alt'] }}</div>@endif
      <div>{{ __('pdf.idcard.id') }}: {{ $c['code'] }}</div>
      <div>{{ __('pdf.idcard.class') }}: {{ $c['class'] ?: '—' }}</div>
      <div>{{ __('pdf.idcard.roll') }}: {{ $c['roll'] ?? '—' }}@if ($c['blood_group']) &nbsp; {{ __('pdf.idcard.blood') }}: {{ $c['blood_group'] }}@endif</div>
    </div>
    <img src="{{ $c['qr'] }}" width="56" height="56" alt="">
  </div>
  @if (!$single && $loop->iteration % 6 === 0 && !$loop->last)<div class="brk"></div>@endif
@empty
  <p>{{ __('pdf.reports.empty') }}</p>
@endforelse
</div>
@endsection

@extends('pdf.layout')

{{-- QB.8 question paper (D66, question-bank.md §3চ): sections in order, numbered questions with marks, MCQ options ক-ঘ, creative
     parts; set B is shuffled by the controller; answers only when asked for (and bought). Printed by headless Chromium (D50).
     Maths ($...$) prints as written - no maths engine runs inside the PDF page (docs/DECISIONS.md, QB.8). --}}
@section('content')
@php($n = fn ($v) => rtrim(rtrim(number_format((float) $v, 2, '.', ''), '0'), '.'))
<style>
  .head { text-align: center; margin-bottom: 8px; } .head h2 { margin: 2px 0; font-size: 15px; }
  .meta { display: flex; justify-content: space-between; font-size: 11px; border-bottom: 1px solid #999999; padding-bottom: 4px; margin-bottom: 8px; }
  .section h3 { font-size: 13px; margin: 10px 0 2px; } .section .ins { font-size: 11px; font-style: italic; margin-bottom: 4px; }
  .q { margin: 6px 0; page-break-inside: avoid; } .q .row { display: flex; gap: 6px; } .q .mk { margin-inline-start: auto; font-size: 11px; white-space: nowrap; }
  .opts { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; padding-inline-start: 22px; font-size: 12px; }
  .parts { padding-inline-start: 22px; } .ans { padding-inline-start: 22px; font-size: 11px; color: #333333; border-inline-start: 2px solid {{ $theme['primary_color'] }}; margin-top: 2px; }
  .text { white-space: pre-wrap; }
  .qmx-align-center { text-align: center; } .qmx-align-right { text-align: right; } .qmx-align-justify { text-align: justify; }
  table.qmx-table { border-collapse: collapse; } table.qmx-table th, table.qmx-table td { border: 1px solid #999; padding: 2px 6px; }   {{-- D72 --}}
</style>
<div class="head">
  <h2>{{ $paper['title'] }}</h2>
  @if ($paper['exam_name'])<div>{{ $paper['exam_name'] }}</div>@endif
</div>
<div class="meta">
  <span>{{ __('pdf.qb_paper.set') }}: {{ $paper['set'] }}</span>
  @if ($paper['duration_minutes'])<span>{{ __('pdf.qb_paper.time') }}: {{ $paper['duration_minutes'] }} {{ __('pdf.qb_paper.minutes') }}</span>@endif
  <span>{{ __('pdf.qb_paper.full_marks') }}: {{ $n($paper['total_marks']) }}</span>
  @if ($paper['answers'])<span><strong>{{ __('pdf.qb_paper.with_answers') }}</strong></span>@endif
</div>
@if ($paper['instructions'])<div class="ins text">{{ $paper['instructions'] }}</div>@endif
@foreach ($paper['sections'] as $s)
  <div class="section">
    <h3>{{ $s['title'] }}</h3>
    @if ($s['instruction'])<div class="ins">{{ $s['instruction'] }}</div>@endif
    @foreach ($s['items'] as $it)
      @php($q = $it['question'])
      <div class="q">
        <div class="row"><strong>{{ $it['no'] }}.</strong><span class="text">{!! \App\Support\QbRichText::html($q['question_text']) !!}</span><span class="mk">[{{ $n($it['marks']) }}]</span></div>
        @if (count($q['options']))
          <div class="opts">@foreach ($q['options'] as $o)<div>{{ $o['label'] }}) {!! \App\Support\QbRichText::html($o['content_text']) !!}@if ($paper['answers'] && !empty($o['is_correct'])) ✓@endif</div>@endforeach</div>
        @endif
        @if (count($q['creative_parts']))
          <div class="parts">@foreach ($q['creative_parts'] as $p)<div>{{ $p['part_label'] }}. {!! \App\Support\QbRichText::html($p['question_text']) !!} [{{ $n($p['marks']) }}]
            @if ($paper['answers'] && !empty($p['answer_text']))<div class="ans text">{!! \App\Support\QbRichText::html($p['answer_text']) !!}</div>@endif</div>@endforeach</div>
        @endif
        @if ($paper['answers'] && !empty($q['answer_text']))<div class="ans text">{{ __('pdf.qb_paper.answer') }}: {!! \App\Support\QbRichText::html($q['answer_text']) !!}</div>@endif
      </div>
    @endforeach
  </div>
@endforeach
@endsection

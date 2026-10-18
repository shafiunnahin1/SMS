@extends('pdf.layout')

{{-- QB.8 question paper (D66, question-bank.md §3চ): sections in order, numbered questions with marks, MCQ options ক-ঘ, creative
     parts; set B is shuffled by the controller; answers only when asked for (and bought). Printed by headless Chromium (D50).
     Maths ($...$) prints as written - no maths engine runs inside the PDF page (docs/DECISIONS.md, QB.8). --}}
@section('content')
@php($optionLabels = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ'])
@php($itemAnswer = fn (string $kind, array $a) => match ($kind) {
    'gap' => e(implode(' / ', (array) ($a['answers'] ?? []))),
    'match_pair' => e($a['right'] ?? ''),
    'match_triple' => e(($a['middle'] ?? '') . ' — ' . ($a['right'] ?? '')),
    'order_step' => e((string) ($a['position'] ?? '')),
    'sub_question' => \App\Support\QbRichText::html((string) ($a['answer_text'] ?? '')),
    'sub_mcq' => e($optionLabels[$a['correct'] ?? -1] ?? ''),
    'true_false' => e(($a['value'] ?? null) === true ? __('pdf.qb_paper.true') : __('pdf.qb_paper.false')),
    'multi_field' => e(implode(', ', array_map('strval', (array) ($a['values'] ?? [])))),
    default => e(collect($a['cells'] ?? [])->map(fn ($v, $c) => $c . ': ' . implode(' / ', (array) $v))->implode('; ')),
})
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
        <div class="row"><strong>{{ $it['no'] }}.</strong><span class="text">{!! \App\Support\QbRichText::html($q['question_text'], $paper['media'] ?? []) !!}</span><span class="mk">[{{ $n($it['marks']) }}]</span></div>
        @if (count($q['options']))
          <div class="opts">@foreach ($q['options'] as $o)<div>{{ $o['label'] }}) {!! \App\Support\QbRichText::html($o['content_text']) !!}@if ($paper['answers'] && !empty($o['is_correct'])) ✓@endif</div>@endforeach</div>
        @endif
        @if (count($q['creative_parts']))
          <div class="parts">@foreach ($q['creative_parts'] as $p)<div>{{ $p['part_label'] }}. {!! \App\Support\QbRichText::html($p['question_text']) !!} [{{ $n($p['marks']) }}]
            @if ($paper['answers'] && !empty($p['answer_text']))<div class="ans text">{!! \App\Support\QbRichText::html($p['answer_text']) !!}</div>@endif</div>@endforeach</div>
        @endif
        {{-- R2.1.2 (D114 (1)): structured types print their passages and parts too; answers only when asked for and allowed --}}
        @foreach ($q['stimuli'] ?? [] as $st)
          <div class="parts text">{!! \App\Support\QbRichText::html($st['content_text'] ?? '', $paper['media'] ?? []) !!}</div>
        @endforeach
        @if (count($q['items'] ?? []))
          <div class="parts">
          @foreach ($q['items'] as $k => $p)
            @php($a = $p['answer_json'] ?? null)
            @php($kind = $p['item_type'])
            <div>{{ $k + 1 }}.
              @if ($kind === 'order_step') ( &nbsp; ) @endif
              {!! \App\Support\QbRichText::html($p['prompt_text'] ?? '') !!}
              @if ($kind === 'gap') ________ @endif
              @if ($kind === 'true_false') ({{ __('pdf.qb_paper.true_false') }}) @endif
              @if ($kind === 'sub_mcq')
                <div class="opts">
                @foreach ($p['prompt_json']['options'] ?? [] as $oi => $ot)
                  <div>{{ $optionLabels[$oi] ?? $oi + 1 }}) {!! \App\Support\QbRichText::html((string) $ot) !!}</div>
                @endforeach
                </div>
              @endif
              @if ($kind === 'multi_field')
                @foreach ($p['prompt_json']['fields'] ?? [] as $fl)
                  <div>{{ is_array($fl) ? ($fl['label'] ?? '') : $fl }}: ________</div>
                @endforeach
              @endif
              @if ($kind === 'table_fill' && !empty($p['prompt_json']['table']['rows']))
                <table class="qmx-table">
                  @if (!empty($p['prompt_json']['table']['columns']))
                    <tr>@foreach ($p['prompt_json']['table']['columns'] as $h) <th>{{ $h }}</th> @endforeach</tr>
                  @endif
                  @foreach ($p['prompt_json']['table']['rows'] as $row)
                    <tr>@foreach ((array) $row as $cell) <td>{{ $cell ?? '________' }}</td> @endforeach</tr>
                  @endforeach
                </table>
              @endif
              @if ($paper['answers'] && is_array($a))
                <div class="ans text">{{ __('pdf.qb_paper.answer') }}: {!! $itemAnswer($kind, $a) !!}</div>
              @endif
            </div>
          @endforeach
          </div>
          @if (!empty($q['choices']))
            <div class="parts">{{ __('pdf.qb_paper.choices') }}: {{ implode(' · ', $q['choices']) }}</div>
          @endif
          @if (!empty($q['triple_choices']))
            <div class="parts">{{ __('pdf.qb_paper.choices') }}: {{ implode(' · ', $q['triple_choices']['middle']) }} | {{ implode(' · ', $q['triple_choices']['right']) }}</div>
          @endif
        @endif
        @if ($paper['answers'] && !empty($q['answer_text']))<div class="ans text">{{ __('pdf.qb_paper.answer') }}: {!! \App\Support\QbRichText::html($q['answer_text'], $paper['media'] ?? []) !!}</div>@endif
      </div>
    @endforeach
  </div>
@endforeach
@endsection

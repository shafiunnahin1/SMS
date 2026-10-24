@php
    $geometry = $settings['geometry'];
    $rectStyle = static fn (array $rect): string => sprintf(
        'left:%.6f%%;top:%.6f%%;width:%.6f%%;height:%.6f%%',
        $rect['left'] * 100,
        $rect['top'] * 100,
        $rect['width'] * 100,
        $rect['height'] * 100,
    );
    // D133 / D110: qbank's controller settings - theme colour for lines and headings (markers and code bits stay black for the
    // scanner), web font, title / subtitle sizes, digital (bubbles) or manual (write-in boxes) candidate info
    $color = \App\Services\QuestionBank\QbOmrFormService::COLORS[$settings['theme_color'] ?? 'black'] ?? '#111111';
    $font = \App\Services\QuestionBank\QbOmrFormService::FONTS[$settings['font'] ?? 'default'] ?? 'Arial, "Noto Sans Bengali", sans-serif';
    $manual = ($settings['entry_mode'] ?? 'digital') === 'manual';
    $subtitle = trim((string) ($settings['subtitle'] ?? '')) !== '' ? $settings['subtitle'] : ($paper->exam_name ?: $paper->title);
    $setRight = ($geometry['set']['left'] ?? 0.7) + ($geometry['set']['width'] ?? 0.04);
    $notesLeft = max(0.755, $setRight + 0.02);
    // a cell line is drawn only clear of the reader's background ring (1.3 x the bubble radius, omrReader scoreBubble), so a line
    // never darkens what a bubble is compared with; crowded sheets keep only the outer frame
    $clear = static fn (array $cell, array $bubble): bool => $cell['width'] >= $bubble['width'] * 1.4 && $cell['height'] >= $bubble['height'] * 1.4;
    $toBangla = static fn (int $number): string => strtr((string) $number, ['0' => '০', '1' => '১', '2' => '২', '3' => '৩', '4' => '৪', '5' => '৫', '6' => '৬', '7' => '৭', '8' => '৮', '9' => '৯']);
@endphp
<!doctype html>
<html lang="{{ $locale }}" dir="{{ $dir }}">
<head>
    <meta charset="utf-8">
    <style>
        @page { size: {{ $settings['page_size'] }} {{ $settings['page_orientation'] }}; margin: 0; }
        html, body { width: 100%; height: 100%; margin: 0; padding: 0; }
        * { box-sizing: border-box; }
        body { color: #111111; background: #ffffff; font-family: {!! $font !!}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .omr-page { position: relative; width: 100vw; height: 100vh; overflow: hidden; background: #ffffff; }
        .heading { position: absolute; top: 1.5%; left: 14%; width: 72%; text-align: center; }
        .heading h1 { margin: 0; font-size: {{ (int) ($settings['title_size'] ?? 20) }}px; color: {{ $color }}; }
        .heading p { margin: 1.5mm 0 0; font-size: 9pt; }
        .heading p.subtitle { font-size: {{ (int) ($settings['subtitle_size'] ?? 14) }}px; }
        .exam-types { position: absolute; top: 20%; left: 30%; width: 40%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 1mm 3mm; font-size: 6.5pt; }
        .exam-types label { display: flex; align-items: center; gap: 1mm; white-space: nowrap; }
        .exam-types i { display: inline-block; width: 3.5mm; height: 3.5mm; border: .25mm solid {{ $color }}; }
        .form-code { position: absolute; top: 13.3%; left: 30%; width: 40%; text-align: center; font-size: 9pt; font-weight: 700; }
        .marker { position: absolute; width: 8mm; height: 8mm; transform: translate(-50%, -50%); background: #000000; }
        .marker::after { position: absolute; top: 2.5mm; left: 2.5mm; width: 3mm; height: 3mm; content: ""; background: #ffffff; }
        .code-bit { position: absolute; border: .25mm solid #111111; background: #ffffff; }
        .code-bit.is-on { background: #000000; }
        .info-title { position: absolute; font-size: 8pt; font-weight: 700; color: {{ $color }}; }
.write-cell { position: absolute; border: .3mm solid {{ $color }}; }
        /* qbank's tables: a framed head cell over each code box and over each answer column (প্রশ্ন | উত্তর), and cell lines; the bubbles keep their exact places */
        .frame { position: absolute; border: .3mm solid {{ $color }}; }
        .grid-cell { position: absolute; border: .15mm solid {{ $color }}; }
        .head-cell { position: absolute; display: flex; align-items: center; justify-content: center; border: .3mm solid {{ $color }}; font-size: 7.5pt; font-weight: 700; color: {{ $color }}; }
        .notes { position: absolute; font-size: 6.5pt; line-height: 1.35; }
        .notes h2 { margin: 0 0 1mm; font-size: 8pt; text-align: center; color: {{ $color }}; border-bottom: .2mm solid {{ $color }}; }
        .notes ol { margin: 0; padding-inline-start: 4mm; }
        .signature { position: absolute; border-top: .25mm solid {{ $color }}; padding-top: 1mm; font-size: 7pt; text-align: center; }
        .footer-note { position: absolute; left: 8%; width: 84%; text-align: center; font-size: 7pt; }
        .manual-info { position: absolute; left: 13%; top: 28%; width: 51%; height: 25%; border: .3mm solid {{ $color }}; padding: 5mm; }
        .manual-info h2 { margin: 0 auto 5mm; width: 36%; border-bottom: .2mm solid {{ $color }}; text-align: center; font-size: 9pt; color: {{ $color }}; }
        .manual-info .line { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 2mm; margin: 4mm 0; font-size: 7.5pt; }
        .manual-info .line.single { grid-template-columns: auto 1fr; }
        .manual-info .fill { border-bottom: .2mm dotted #111111; min-width: 12mm; }
        .manual-notes { position: absolute; left: 67%; top: 28%; width: 25%; height: 25%; border: .3mm solid {{ $color }}; padding: 4mm; }
        .manual-notes h2 { margin: -4mm -4mm 2mm; padding: 2mm; background: {{ $color }}; color: #ffffff; text-align: center; font-size: 8pt; }
        .bubble { position: absolute; display: flex; align-items: center; justify-content: center; border: .3mm solid {{ $color }}; border-radius: 50%; font-size: 6.5pt; line-height: 1; }
        .answers-title { position: absolute; top: 45.5%; left: 8%; width: 84%; text-align: center; font-size: 10pt; font-weight: 700; color: {{ $color }}; }
        .question-number { position: absolute; display: flex; align-items: center; justify-content: center; font-size: 8pt; font-weight: 700; }
        .subject-heading { position: absolute; display: flex; align-items: flex-end; font-size: 7.5pt; font-weight: 700; border-bottom: .2mm solid {{ $color }}; overflow: hidden; white-space: nowrap; }
        .answer-bubble { position: absolute; display: flex; align-items: center; justify-content: center; border: .3mm solid {{ $color }}; border-radius: 50%; font-size: 6pt; line-height: 1; }
    </style>
</head>
<body>
<main class="omr-page">
    <header class="heading">
        <h1>{{ $settings['title'] }}</h1>
        <p class="subtitle">{{ $subtitle }}</p>
        <p>{{ __('pdf.qb_omr.form_code') }}: {{ $form->code }} · {{ __('pdf.qb_omr.set') }}: {{ $variant->code }}</p>
    </header>

    <section class="exam-types" aria-label="{{ __('pdf.qb_omr.instructions') }}">
        @foreach (__('pdf.qb_omr.exam_types') as $examType)
            <label><i></i>{{ $examType }}</label>
        @endforeach
    </section>

    @foreach ([['left', 'top'], ['right', 'top'], ['left', 'bottom'], ['right', 'bottom']] as [$x, $y])
        <span class="marker" style="left:{{ $geometry['markers'][$x] * 100 }}%;top:{{ $geometry['markers'][$y] * 100 }}%"></span>
    @endforeach

    @foreach ($geometry['code']['bits'] as $index => $bit)
        <span class="code-bit {{ $geometry['code']['value'][$index] === '1' ? 'is-on' : '' }}" style="{{ $rectStyle($bit) }}"></span>
    @endforeach

    @if ($manual)
        <section class="manual-info">
            <h2>{{ __('pdf.qb_omr.candidate_info') }}</h2>
            <div class="line single"><strong>{{ __('pdf.qb_omr.name') }}:</strong><span class="fill"></span></div>
            <div class="line"><strong>{{ __('pdf.qb_omr.class') }}:</strong><span class="fill"></span><strong>{{ __('pdf.qb_omr.roll') }}:</strong><span class="fill"></span></div>
            <div class="line"><strong>{{ __('pdf.qb_omr.subject') }}:</strong><span class="fill"></span><strong>{{ __('pdf.qb_omr.set') }}:</strong><span class="fill"></span></div>
            <div class="line single"><strong>{{ __('pdf.qb_omr.date') }}:</strong><span class="fill"></span></div>
        </section>
        <section class="manual-notes">
            <h2>{{ __('pdf.qb_omr.instructions') }}</h2>
            <ol>@foreach (__('pdf.qb_omr.rules') as $rule)<li>{{ $rule }}</li>@endforeach</ol>
            <div class="signature" style="left:8%;top:78%;width:84%">{{ __('pdf.qb_omr.invigilator') }}</div>
        </section>
    @endif

    @foreach (['class' => 'class', 'roll' => 'roll', 'subject' => 'subject', 'set' => 'set'] as $key => $label)
        @if (!$manual)
        @if (($settings['info_boxes'][$key]['visible'] ?? true) === true)
            <strong class="head-cell" style="left:{{ $geometry[$key]['left'] * 100 }}%;top:{{ max(0, ($geometry[$key]['top'] * 100) - 2.6) }}%;width:{{ max($geometry[$key]['width'] * 100, 6) }}%;height:2.4%">{{ __('pdf.qb_omr.' . $label) }}</strong>
            @unless ($manual)
                @foreach ($geometry[$key]['rows'][0] as $c => $first)
                    @continue (!$clear($first['cell'], $first['bubble']))
                    <span class="grid-cell" style="{{ $rectStyle(['left' => $first['cell']['left'], 'top' => $first['cell']['top'], 'width' => $first['cell']['width'], 'height' => $geometry[$key]['height']]) }}"></span>
                @endforeach
            @endunless
            @if ($manual)
                {{-- manual: one write-in box per digit (two rows high) instead of the bubbles --}}
                @foreach ($geometry[$key]['rows'][0] as $cell)
                    <span class="write-cell" style="{{ $rectStyle(['left' => $cell['cell']['left'], 'top' => $cell['cell']['top'], 'width' => $cell['cell']['width'], 'height' => $cell['cell']['height'] * 2]) }}"></span>
                @endforeach
            @else
            @foreach ($geometry[$key]['rows'] as $rowIndex => $row)
                @foreach ($row as $cell)
                    <span class="bubble" style="{{ $rectStyle($cell['bubble']) }}">{{ $key === 'set' ? ($set_symbols[$rowIndex] ?? '') : $toBangla($rowIndex) }}</span>
                @endforeach
            @endforeach
            @endif
        @endif
        @endif
    @endforeach

    @if (!$manual && $notesLeft < 0.83)
        {{-- qbank's instructions column and the invigilator's signature, beside the code boxes --}}
        <section class="notes" style="left:{{ $notesLeft * 100 }}%;top:28%;width:{{ (0.955 - $notesLeft) * 100 }}%">
            <h2>{{ __('pdf.qb_omr.instructions') }}</h2>
            <ol>@foreach (__('pdf.qb_omr.rules') as $rule)<li>{{ $rule }}</li>@endforeach</ol>
        </section>
        <div class="signature" style="left:{{ $notesLeft * 100 }}%;top:59%;width:{{ (0.955 - $notesLeft) * 100 }}%">{{ __('pdf.qb_omr.invigilator') }}</div>
    @endif
    <div class="answers-title" style="top:{{ max(0, ($geometry['answers']['top'] * 100) - 3.5) }}%">{{ __('pdf.qb_omr.mcq_answers') }}</div>
    @foreach ($geometry['answers']['columns'] as $column)
        @php
            $firstNumber = $column['rows'][0]['number'] ?? null;
            $numberWidth = $firstNumber['width'] ?? 0;
            $tableLeft = $column['left'] - $numberWidth;
            $headHeight = 0.024;
        @endphp
        @if ($firstNumber)
            <span class="head-cell" style="{{ $rectStyle(['left' => $tableLeft, 'top' => $column['top'] - $headHeight, 'width' => $numberWidth, 'height' => $headHeight]) }}">{{ __('pdf.qb_omr.question') }}</span>
            <span class="head-cell" style="{{ $rectStyle(['left' => $column['left'], 'top' => $column['top'] - $headHeight, 'width' => $column['width'], 'height' => $headHeight]) }}">{{ __('pdf.qb_omr.answer') }}</span>
            <span class="frame" style="{{ $rectStyle(['left' => $tableLeft, 'top' => $column['top'], 'width' => $numberWidth + $column['width'], 'height' => $column['height']]) }}"></span>
            @if ($clear($column['rows'][0]['options'][0]['cell'], $column['rows'][0]['options'][0]['bubble']))
                @foreach ($column['rows'] as $row)
                    <span class="grid-cell" style="{{ $rectStyle($row['number']) }}"></span>
                    @foreach ($row['options'] as $option)<span class="grid-cell" style="{{ $rectStyle($option['cell']) }}"></span>@endforeach
                @endforeach
            @endif
        @endif
        @foreach ($column['headings'] ?? [] as $heading)
            <span class="subject-heading" style="{{ $rectStyle($heading['rect']) }}">{{ $heading['label'] }}</span>
        @endforeach
        @foreach ($column['rows'] as $row)
            <span class="question-number" style="{{ $rectStyle($row['number']) }}">{{ $toBangla($row['question_index'] + 1) }}</span>
            @foreach ($row['options'] as $optionIndex => $option)
                <span class="answer-bubble" style="{{ $rectStyle($option['bubble']) }}">{{ $settings['option_labels'][$optionIndex] ?? '' }}</span>
            @endforeach
        @endforeach
    @endforeach
    <div class="footer-note" style="top:{{ min(92, (($geometry['answers']['top'] ?? 0.47) + ($geometry['answers']['height'] ?? 0.4)) * 100 + 1.2) }}%">{{ __('pdf.qb_omr.footer') }}</div>
</main>
</body>
</html>
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
    // qbank prints the title alone; a subtitle line only when one is set (or the paper names its exam)
    $subtitle = trim((string) ($settings['subtitle'] ?? '')) !== '' ? $settings['subtitle'] : ($paper->exam_name ?? '');
    $subtitleShown = trim((string) $subtitle) !== '';
    // the light shade of qbank's roll / subject cells and of every other answer column (theme colour at 14%)
    $tint = $color . '24';
    $setRight = ($geometry['set']['left'] ?? 0.7) + ($geometry['set']['width'] ?? 0.04);
    $notesLeft = max(0.765, $setRight + 0.03);
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
        /* qbank's sheet: markers and the code bar at the top, the title and the exam-type boxes under them, the code boxes (head cell,
           write-in row, bubble rows) or the manual candidate panel, the instructions column, then the answer tables */
        .heading { position: absolute; top: 7.6%; left: 20%; width: 60%; text-align: center; line-height: 1.2; }
        .heading h1 { margin: 0; font-size: {{ (int) ($settings['title_size'] ?? 20) }}px; font-weight: 600; color: #111111; }
        .heading p.subtitle { margin: .5mm 0 0; font-size: {{ (int) ($settings['subtitle_size'] ?? 14) }}px; }
        .exam-types { position: absolute; top: {{ $subtitleShown ? 13.4 : 11.6 }}%; left: 35.5%; width: 34%; display: grid; grid-template-columns: 1.05fr 1.2fr 1fr; gap: 1.6mm 2mm; font-size: 6.5pt; }
        .exam-types label { display: flex; align-items: center; gap: 1.5mm; white-space: nowrap; }
        .exam-types i { display: inline-block; flex: none; width: 3.6mm; height: 3.6mm; border: .25mm solid {{ $color }}; }
        .marker { position: absolute; width: 8mm; height: 8mm; transform: translate(-50%, -50%); background: #000000; }
        .marker::after { position: absolute; top: 2.5mm; left: 2.5mm; width: 3mm; height: 3mm; content: ""; background: #ffffff; }
        .code-bit { position: absolute; border: .25mm solid #111111; background: #ffffff; }
        .code-bit.is-on { background: #000000; }
        /* tables: a framed head cell over each code box and over each answer column (প্রশ্ন | উত্তর), and cell lines; the bubbles keep their exact places */
        .frame { position: absolute; border: .3mm solid {{ $color }}; }
        .grid-cell { position: absolute; border: .2mm solid {{ $color }}; }
        .grid-cell.tint { background: {{ $tint }}; }
        .write-cell { position: absolute; border: .2mm solid {{ $color }}; }
        .head-cell { position: absolute; display: flex; align-items: center; justify-content: center; border: .3mm solid {{ $color }}; background: #ffffff; font-size: 8pt; font-weight: 700; color: #111111; white-space: nowrap; }
        .notes { position: absolute; font-size: 6.5pt; line-height: 1.5; }
        .notes h2 { margin: 0 0 1.5mm; padding-bottom: 1mm; font-size: 8pt; text-align: center; color: #111111; border-bottom: .2mm solid {{ $color }}; }
        .notes ol { margin: 0; padding-inline-start: 4mm; }
        .notes li { margin-bottom: 1mm; }
        .signature { position: absolute; border-top: .3mm solid {{ $color }}; padding-top: 1.2mm; font-size: 6.5pt; font-weight: 700; text-align: center; }
        .footer-note { position: absolute; left: 8%; width: 84%; text-align: center; font-size: 6.5pt; }
        .manual-info { position: absolute; left: 6.4%; top: 17.5%; width: 58.4%; height: 21.7%; border: .3mm solid {{ $color }}; padding: 3mm 6mm; }
        .manual-info h2 { margin: 0 auto 5mm; width: 38%; padding-bottom: 1mm; border-bottom: .25mm solid {{ $color }}; text-align: center; font-size: 9pt; color: #111111; }
        .manual-info .line { display: grid; align-items: end; gap: 2mm; margin: 0 0 6mm; font-size: 7.5pt; font-weight: 700; }
        .manual-info .line.single { grid-template-columns: auto 1fr; }
        .manual-info .line.triple { grid-template-columns: auto 1.6fr auto 1fr auto 1.2fr; }
        .manual-info .fill { border-bottom: .25mm dotted #111111; min-width: 10mm; height: 3mm; }
        .manual-notes { position: absolute; left: 67%; top: 17.5%; width: 27%; height: 21.7%; border: .3mm solid {{ $color }}; padding: 0 3mm 3mm; font-size: 6pt; line-height: 1.5; }
        .manual-notes h2 { margin: 0 -3mm 2mm; padding: 1.6mm; background: {{ $color }}; color: #ffffff; text-align: center; font-size: 8pt; }
        .manual-notes ol { margin: 0; padding: 0; list-style: none; }
        .bubble { position: absolute; display: flex; align-items: center; justify-content: center; border: .3mm solid #111111; border-radius: 50%; background: #ffffff; font-size: 6.5pt; font-weight: 600; line-height: 1; }
        .answers-title { position: absolute; left: 8%; width: 84%; text-align: center; font-size: 8.5pt; font-weight: 700; color: #111111; }
        .question-number { position: absolute; display: flex; align-items: center; justify-content: center; font-size: 8pt; font-weight: 700; }
        .subject-heading { position: absolute; display: flex; align-items: flex-end; font-size: 7.5pt; font-weight: 700; border-bottom: .2mm solid {{ $color }}; overflow: hidden; white-space: nowrap; }
        .answer-bubble { position: absolute; display: flex; align-items: center; justify-content: center; border: .3mm solid #111111; border-radius: 50%; background: #ffffff; font-size: 6.5pt; line-height: 1; }
    </style>
</head>
<body>
<main class="omr-page">
    <header class="heading">
        <h1>{{ $settings['title'] }}</h1>
        @if ($subtitleShown)<p class="subtitle">{{ $subtitle }}</p>@endif
    </header>

    <section class="exam-types" aria-label="{{ __('pdf.qb_omr.exam_type') }}">
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
            <div class="line single"><span>{{ __('pdf.qb_omr.name') }}:</span><span class="fill"></span></div>
            <div class="line triple"><span>{{ __('pdf.qb_omr.class') }}:</span><span class="fill"></span><span>{{ __('pdf.qb_omr.roll') }}:</span><span class="fill"></span><span>{{ __('pdf.qb_omr.department') }}:</span><span class="fill"></span></div>
            <div class="line triple"><span>{{ __('pdf.qb_omr.subject_name') }}:</span><span class="fill"></span><span>{{ __('pdf.qb_omr.paper') }}:</span><span class="fill"></span><span>{{ __('pdf.qb_omr.subject') }}:</span><span class="fill"></span></div>
            <div class="line triple"><span>{{ __('pdf.qb_omr.date') }}:</span><span class="fill"></span><span>{{ __('pdf.qb_omr.set') }}:</span><span class="fill"></span><span></span><span></span></div>
        </section>
        <section class="manual-notes">
            <h2>{{ __('pdf.qb_omr.instructions') }}</h2>
            <ol>@foreach (__('pdf.qb_omr.rules') as $i => $rule)<li>{{ $locale === 'bn' ? $toBangla($i + 1) : $i + 1 }}। {{ $rule }}</li>@endforeach</ol>
            <div class="signature" style="left:6%;top:74%;width:88%;border-top-color:#111111">{{ __('pdf.qb_omr.invigilator') }}</div>
        </section>
    @else
        @foreach (['class' => 'class', 'roll' => 'roll_number', 'subject' => 'subject', 'set' => 'set_code'] as $key => $label)
            @continue (($settings['info_boxes'][$key]['visible'] ?? true) !== true)
            @php
                $box = $geometry[$key];
                $headWidth = max($box['width'], 0.095);
                $headLeft = $box['left'] + ($box['width'] / 2) - ($headWidth / 2);
                $writeHeight = 0.0235;
                $tinted = in_array($key, ['roll', 'subject'], true);
            @endphp
            {{-- head cell, one write-in box per digit, then a ruled cell around each bubble (cell lines only clear of the reader's ring) --}}
            <strong class="head-cell" style="{{ $rectStyle(['left' => $headLeft, 'top' => $box['top'] - $writeHeight - 0.022, 'width' => $headWidth, 'height' => 0.022]) }}">{{ __('pdf.qb_omr.' . $label) }}</strong>
            @foreach ($box['rows'][0] as $first)
                <span class="write-cell" style="{{ $rectStyle(['left' => $first['cell']['left'], 'top' => $box['top'] - $writeHeight, 'width' => $first['cell']['width'], 'height' => $writeHeight]) }}"></span>
            @endforeach
            @foreach ($box['rows'] as $rowIndex => $row)
                @foreach ($row as $cell)
                    @if ($clear($cell['cell'], $cell['bubble']))<span class="grid-cell {{ $tinted ? 'tint' : '' }}" style="{{ $rectStyle($cell['cell']) }}"></span>@endif
                    <span class="bubble" style="{{ $rectStyle($cell['bubble']) }}">{{ $key === 'set' ? ($set_symbols[$rowIndex] ?? '') : $rowIndex }}</span>
                @endforeach
            @endforeach
        @endforeach

        @if ($notesLeft < 0.85)
            {{-- qbank's instructions column and the invigilator's signature, beside the code boxes --}}
            <section class="notes" style="left:{{ $notesLeft * 100 }}%;top:{{ ($geometry['set']['top'] - 0.0455) * 100 }}%;width:{{ (0.94 - $notesLeft) * 100 }}%">
                <h2>{{ __('pdf.qb_omr.instructions') }}</h2>
                <ol>@foreach (__('pdf.qb_omr.rules') as $rule)<li>{{ $rule }}</li>@endforeach</ol>
            </section>
            <div class="signature" style="left:{{ $notesLeft * 100 }}%;top:{{ ($geometry['set']['top'] + $geometry['set']['height'] - 0.012) * 100 }}%;width:{{ (0.94 - $notesLeft) * 100 }}%">{{ __('pdf.qb_omr.invigilator') }}</div>
        @endif
    @endif
    <div class="answers-title" style="top:{{ max(0, ($geometry['answers']['top'] * 100) - 4.4) }}%">{{ __('pdf.qb_omr.mcq_answers') }}</div>
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
                    @foreach ($row['options'] as $o => $option)<span class="grid-cell {{ $o % 2 === 0 ? 'tint' : '' }}" style="{{ $rectStyle($option['cell']) }}"></span>@endforeach
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
    <div class="footer-note" style="top:{{ min(92, (($geometry['answers']['top'] ?? 0.47) + max(array_map(fn ($c) => $c['height'], $geometry['answers']['columns']))) * 100 + 1.4) }}%">{{ __('pdf.qb_omr.footer') }}</div>
</main>
</body>
</html>
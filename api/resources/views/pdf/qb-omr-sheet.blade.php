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
    $subtitle = trim((string) ($settings['subtitle'] ?? ''));
    $subtitleShown = trim((string) $subtitle) !== '';
    // the light shade of qbank's roll / subject cells and of every other answer column (theme colour at 14%)
    $tint = $color . '24';
    $setRight = ($geometry['set']['left'] ?? 0.7) + ($geometry['set']['width'] ?? 0.04);
    $notesLeft = max(0.765, $setRight + 0.03);
    // a cell line is drawn only clear of the reader's background ring (1.3 x the bubble radius, omrReader scoreBubble), so a line
    // never darkens what a bubble is compared with; crowded sheets keep only the outer frame
    $clear = static fn (array $cell, array $bubble): bool => $cell['width'] >= $bubble['width'] * 1.4 && $cell['height'] >= $bubble['height'] * 1.4;
    // owner report 2026-10-24: the heading and the exam-type boxes take the band between the code bar (or the top markers) and the
    // highest code-box head of THIS form's geometry, so a form generated with an older layout never prints text over the bar or boxes
    $barBottom = $geometry['code']['top'] + $geometry['code']['height'];
    $boxHeads = [];
    foreach (['class', 'roll', 'student_id', 'subject', 'set'] as $k) if (isset($geometry[$k]) && ($settings['info_boxes'][$k]['visible'] ?? true) === true) $boxHeads[] = $geometry[$k]['top'] - 0.0455;
    $headingTop = $barBottom < 0.07 ? 0.062 : $barBottom + 0.006;
    $headingBottom = ($manual ? 0.10 : ($boxHeads ? min($boxHeads) : 0.19)) - 0.006;
    // owner 2026-10-24: the content keeps its own size; on a page it does not fit (A5, sideways) it is drawn at A4 upright and runs over
    $sheetMm = \App\Services\QuestionBank\QbOmrFormService::pageFits($settings)
        ? (($settings['page_size'] ?? 'a4') === 'legal' ? [215.9, 355.6] : [210, 297]) : [210, 297];
    $toBangla = static fn (int $number): string => strtr((string) $number, ['0' => '০', '1' => '১', '2' => '২', '3' => '৩', '4' => '৪', '5' => '৫', '6' => '৬', '7' => '৭', '8' => '৮', '9' => '৯']);
@endphp
<!doctype html>
<html lang="{{ $locale }}" dir="{{ $dir }}">
<head>
    <meta charset="utf-8">
    <style>
        @page { size: {{ $settings['page_size'] }} {{ $settings['page_orientation'] }}; margin: 0; }
        html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; }   /* an oversize sheet runs over the page edge, never onto a second page */
        * { box-sizing: border-box; }
        body { color: #111111; background: #ffffff; font-family: {!! $font !!}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .omr-page { position: relative; width: {{ $sheetMm[0] }}mm; height: {{ $sheetMm[1] }}mm; overflow: hidden; background: #ffffff; }
        /* qbank's sheet: markers and the code bar at the top, the title and the exam-type boxes under them, the code boxes (head cell,
           write-in row, bubble rows) or the manual candidate panel, the instructions column, then the answer tables */
        .heading { position: absolute; top: {{ $headingTop * 100 }}%; height: {{ max(0.03, $headingBottom - $headingTop) * 100 }}%; left: 15%; width: 70%; display: flex; flex-flow: row wrap; justify-content: center; align-items: baseline; align-content: flex-start; column-gap: 2mm; text-align: center; line-height: 1.3; overflow: hidden; }
        .heading .sep { color: {{ $color }}; }   /* owner 2026-10-24: institution · title · subtitle on one line */
        .heading h1 { margin: 0; font-size: {{ (int) ($settings['title_size'] ?? 20) }}px; font-weight: 700; color: {{ $color }}; }
        .heading p { margin: .3mm 0 0; font-size: 10px; }
        .heading p.details { margin: .8mm 0 0; font-size: 8px; color: #333333; }
        .heading p.exam { margin: 0; font-size: {{ (int) ($settings['title_size'] ?? 20) }}px; font-weight: 600; }
        .heading .meta { align-self: stretch; display: flex; justify-content: space-between; margin-top: .8mm; font-size: 9px; }
        .set-box { position: absolute; top: 7.8%; right: 4%; display: flex; flex-direction: column; align-items: flex-end; gap: 1mm; padding: 1.2mm 2mm; border: .4mm solid {{ $color }}; font-size: 8px; font-weight: 700; color: {{ $color }}; }
        .set-box .code-row { display: flex; align-items: center; gap: 1.5mm; }
        .set-box .digits { display: flex; }
        .set-box b { display: inline-flex; align-items: center; justify-content: center; width: 4.2mm; height: 4.6mm; margin-inline-start: -.3mm; border: .3mm solid {{ $color }}; font-size: 9px; color: #111111; }
        .set-box b.wide { width: 7mm; }
        .heading p.subtitle { margin: 0; font-size: {{ (int) ($settings['subtitle_size'] ?? 14) }}px; }
        .marker { position: absolute; width: 8mm; height: 8mm; transform: translate(-50%, -50%); background: #000000; }
        .marker::after { position: absolute; top: 2.5mm; left: 2.5mm; width: 3mm; height: 3mm; content: ""; background: #ffffff; }
        .code-bit { position: absolute; border: .25mm solid #111111; background: #ffffff; }
        .code-bit.is-on { background: #000000; }
        /* tables: a framed head cell over each code box and over each answer column (প্রশ্ন | উত্তর), and cell lines; the bubbles keep their exact places */
        .frame { position: absolute; border: .3mm solid {{ $color }}; }
        .grid-cell { position: absolute; border: .2mm solid {{ $color }}; }
        .grid-cell.tint { background: {{ $tint }}; }
        .write-cell { position: absolute; border: .2mm solid {{ $color }}; }
        .head-cell { position: absolute; display: flex; align-items: center; justify-content: center; border: .3mm solid {{ $color }}; background: #ffffff; font-size: 8pt; font-weight: 700; color: {{ $color }}; white-space: nowrap; }
        .notes { position: absolute; font-size: 6.5pt; line-height: 1.5; }
        .notes h2 { margin: 0 0 1.5mm; padding-bottom: 1mm; font-size: 8pt; text-align: center; color: {{ $color }}; border-bottom: .2mm solid {{ $color }}; }
        .notes ol { margin: 0; padding-inline-start: 4mm; }
        .notes li { margin-bottom: 1mm; }
        .signature { position: absolute; border-top: .3mm solid {{ $color }}; padding-top: 1.2mm; font-size: 6.5pt; font-weight: 700; text-align: center; }
        .footer-note { position: absolute; left: 8%; width: 84%; text-align: center; font-size: 6.5pt; }
        .manual-info { position: absolute; left: 6.4%; top: 10%; width: 58.4%; height: 21.7%; border: .3mm solid {{ $color }}; padding: 3mm 6mm; }
        .manual-info h2 { margin: 0 auto 5mm; width: 38%; padding-bottom: 1mm; border-bottom: .25mm solid {{ $color }}; text-align: center; font-size: 9pt; color: {{ $color }}; }
        .manual-info .line { display: grid; align-items: end; gap: 2mm; margin: 0 0 6mm; font-size: 7.5pt; font-weight: 700; }
        .manual-info .line.single { grid-template-columns: auto 1fr; }
        .manual-info .line.triple { grid-template-columns: auto 1.6fr auto 1fr auto 1.2fr; }
        .manual-info .fill { border-bottom: .25mm dotted #111111; min-width: 10mm; height: 3mm; }
        .manual-notes { position: absolute; left: 67%; top: 10%; width: 27%; height: 21.7%; border: .3mm solid {{ $color }}; padding: 0 3mm 3mm; font-size: 6pt; line-height: 1.5; }
        .manual-notes h2 { margin: 0 -3mm 2mm; padding: 1.6mm; background: {{ $color }}; color: #ffffff; text-align: center; font-size: 8pt; }
        .manual-notes ol { margin: 0; padding: 0; list-style: none; }
        .bubble { position: absolute; display: flex; align-items: center; justify-content: center; border: .3mm solid {{ $color }}; border-radius: 50%; background: #ffffff; font-size: 6.5pt; font-weight: 600; line-height: 1; }
        .answers-title { position: absolute; left: 8%; width: 84%; text-align: center; font-size: 8.5pt; font-weight: 700; color: {{ $color }}; }
        .question-number { position: absolute; display: flex; align-items: center; justify-content: center; font-size: 8pt; font-weight: 700; }
        .subject-heading { position: absolute; display: flex; align-items: center; justify-content: center;   /* owner 2026-10-24: centred in its column */
             font-size: 7.5pt; font-weight: 700; border-bottom: .2mm solid {{ $color }}; overflow: hidden; white-space: nowrap; }
        .answer-bubble { position: absolute; display: flex; align-items: center; justify-content: center; border: .3mm solid {{ $color }}; border-radius: 50%; background: #ffffff; font-size: 6.5pt; line-height: 1; }
    </style>
</head>
<body>
<main class="omr-page">
    {{-- owner request 2026-10-24: the paper's own heading (institution, exam, class, subjects, time, full marks, set) on every sheet,
         so sheets of different papers are not mixed up when handed out; the OMR title is the exam line when one is set --}}
    @php
        $head = $header ?? [];
        $exam = trim((string) ($settings['title'] ?? '')) !== '' ? $settings['title'] : ($head['exam'] ?? '');
        $digits = static fn ($v) => $locale === 'bn' ? strtr((string) $v, ['0' => '০', '1' => '১', '2' => '২', '3' => '৩', '4' => '৪', '5' => '৫', '6' => '৬', '7' => '৭', '8' => '৮', '9' => '৯']) : (string) $v;
        $marks = isset($head['total_marks']) && $head['total_marks'] !== null ? rtrim(rtrim((string) $head['total_marks'], '0'), '.') : '';
    @endphp
    {{-- owner 2026-10-24: institution, title and subtitle in one small size (title_size / subtitle_size, 12px by default), no exam-type
         boxes; the title starts as the paper's class and the subtitle as its subjects (editable in the form settings) --}}
    @php
        $title = trim((string) ($settings['title'] ?? '')) !== '' ? $settings['title'] : (($head['class'] ?? '') !== '' ? $head['class'] : $exam);
        $sub = $subtitleShown ? $subtitle : ($head['subjects'] ?? '');
    @endphp
    <header class="heading">
        @if (($head['institution'] ?? '') !== '')<h1>{{ $head['institution'] }}</h1>@endif
        @if (trim((string) $title) !== '')@if (($head['institution'] ?? '') !== '')<span class="sep">·</span>@endif<p class="exam">{{ $title }}</p>@endif
        @if (trim((string) $sub) !== '')<span class="sep">·</span><p class="subtitle">{{ $sub }}</p>@endif
    </header>
    {{-- the board paper's framed box: each subject's code in digit boxes (one row per subject), then the set --}}
    {{-- owner 2026-10-24: one sheet serves every set - the student marks the set code; the header names no set, time or full marks --}}
    @if (!empty($head['subject_codes']))
    <div class="set-box">
        @foreach ($head['subject_codes'] ?? [] as $subjectCode)
            <div class="code-row">{{ __('pdf.qb_omr.subject') }} :<span class="digits">@foreach (mb_str_split($subjectCode) as $ch)<b>{{ $digits($ch) }}</b>@endforeach</span></div>
        @endforeach
    </div>
    @endif


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
            <div class="signature" style="left:6%;top:74%;width:88%">{{ __('pdf.qb_omr.invigilator') }}</div>
        </section>
    @else
        @foreach (['class' => 'class', 'roll' => 'roll_number', ...(isset($geometry['student_id']) ? ['student_id' => 'student_id'] : ['subject' => 'subject']), 'set' => 'set_code'] as $key => $label)
            @continue (($settings['info_boxes'][$key]['visible'] ?? true) !== true)
            @php
                $box = $geometry[$key];
                $headWidth = max($box['width'], min(0.095, $box['width'] + 0.03));   // a narrow box's head grows a little, never over its neighbour
                $headLeft = $box['left'] + ($box['width'] / 2) - ($headWidth / 2);
                $writeHeight = 0.0235;
                $tinted = in_array($key, ['roll', 'subject', 'student_id'], true);
            @endphp
            {{-- head cell, one write-in box per digit, then a ruled cell around each bubble (cell lines only clear of the reader's ring) --}}
            <strong class="head-cell" style="{{ $rectStyle(['left' => $headLeft, 'top' => $box['top'] - $writeHeight - 0.022, 'width' => $headWidth, 'height' => 0.022]) }}{{ $headWidth < 0.075 ? ';font-size:6.5pt;padding:0 .6mm' : '' }}">{{ __('pdf.qb_omr.' . $label) }}</strong>
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
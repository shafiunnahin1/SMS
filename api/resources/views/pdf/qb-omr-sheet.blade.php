@php
    $geometry = $settings['geometry'];
    $rectStyle = static fn (array $rect): string => sprintf(
        'left:%.6f%%;top:%.6f%%;width:%.6f%%;height:%.6f%%',
        $rect['left'] * 100,
        $rect['top'] * 100,
        $rect['width'] * 100,
        $rect['height'] * 100,
    );
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
        body { color: #111111; background: #ffffff; font-family: Arial, "Noto Sans Bengali", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .omr-page { position: relative; width: 100vw; height: 100vh; overflow: hidden; background: #ffffff; }
        .heading { position: absolute; top: 1.5%; left: 14%; width: 72%; text-align: center; }
        .heading h1 { margin: 0; font-size: 16pt; }
        .heading p { margin: 2mm 0 0; font-size: 9pt; }
        .form-code { position: absolute; top: 13.3%; left: 30%; width: 40%; text-align: center; font-size: 9pt; font-weight: 700; }
        .marker { position: absolute; width: 8mm; height: 8mm; transform: translate(-50%, -50%); background: #000000; }
        .marker::after { position: absolute; top: 2.5mm; left: 2.5mm; width: 3mm; height: 3mm; content: ""; background: #ffffff; }
        .code-bit { position: absolute; border: .25mm solid #111111; background: #ffffff; }
        .code-bit.is-on { background: #000000; }
        .info-title { position: absolute; font-size: 8pt; font-weight: 700; }
        .bubble { position: absolute; display: flex; align-items: center; justify-content: center; border: .3mm solid #111111; border-radius: 50%; font-size: 6.5pt; line-height: 1; }
        .answers-title { position: absolute; top: 45.5%; left: 8%; width: 84%; text-align: center; font-size: 10pt; font-weight: 700; }
        .question-number { position: absolute; display: flex; align-items: center; justify-content: center; font-size: 8pt; font-weight: 700; }
        .answer-bubble { position: absolute; display: flex; align-items: center; justify-content: center; border: .3mm solid #111111; border-radius: 50%; font-size: 6pt; line-height: 1; }
    </style>
</head>
<body>
<main class="omr-page">
    <header class="heading">
        <h1>{{ $settings['title'] }}</h1>
        <p>{{ $paper->exam_name ?: $paper->title }}</p>
        <p>{{ __('pdf.qb_omr.form_code') }}: {{ $form->code }} · {{ __('pdf.qb_omr.set') }}: {{ $variant->code }}</p>
    </header>

    @foreach ([['left', 'top'], ['right', 'top'], ['left', 'bottom'], ['right', 'bottom']] as [$x, $y])
        <span class="marker" style="left:{{ $geometry['markers'][$x] * 100 }}%;top:{{ $geometry['markers'][$y] * 100 }}%"></span>
    @endforeach

    @foreach ($geometry['code']['bits'] as $index => $bit)
        <span class="code-bit {{ $geometry['code']['value'][$index] === '1' ? 'is-on' : '' }}" style="{{ $rectStyle($bit) }}"></span>
    @endforeach

    @foreach (['class' => 'class', 'roll' => 'roll', 'subject' => 'subject', 'set' => 'set'] as $key => $label)
        @if (($settings['info_boxes'][$key]['visible'] ?? true) === true)
            <strong class="info-title" style="left:{{ $geometry[$key]['left'] * 100 }}%;top:{{ max(0, ($geometry[$key]['top'] * 100) - 2.8) }}%">{{ __('pdf.qb_omr.' . $label) }}</strong>
            @foreach ($geometry[$key]['rows'] as $rowIndex => $row)
                @foreach ($row as $cell)
                    <span class="bubble" style="{{ $rectStyle($cell['bubble']) }}">{{ $key === 'set' ? ($set_symbols[$rowIndex] ?? '') : $toBangla($rowIndex) }}</span>
                @endforeach
            @endforeach
        @endif
    @endforeach

    <div class="answers-title">{{ __('pdf.qb_omr.answers') }} · {{ $settings['question_count'] }}</div>
    @foreach ($geometry['answers']['columns'] as $column)
        @foreach ($column['rows'] as $row)
            <span class="question-number" style="{{ $rectStyle($row['number']) }}">{{ $toBangla($row['question_index'] + 1) }}</span>
            @foreach ($row['options'] as $optionIndex => $option)
                <span class="answer-bubble" style="{{ $rectStyle($option['bubble']) }}">{{ $settings['option_labels'][$optionIndex] ?? '' }}</span>
            @endforeach
        @endforeach
    @endforeach
</main>
</body>
</html>
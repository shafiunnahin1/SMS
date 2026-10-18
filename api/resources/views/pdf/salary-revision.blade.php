@extends('pdf.layout')
@section('content')
<h2>{{ __('salary.letter') }}</h2>
<p>{{ $revision->letter_no }} · {{ $name }}</p>
<table>
<tr><th>{{ __('salary.effective') }}</th><td>{{ $revision->effective_from->format('Y-m-d') }}</td></tr>
<tr><th>{{ __('salary.basic') }}</th><td>{{ $revision->old_basic ?? '—' }} → {{ $revision->new_basic }}</td></tr>
<tr><th>{{ __('salary.gross') }}</th><td>{{ $revision->old_gross ?? '—' }} → {{ $revision->new_gross }}</td></tr>
</table>
<p>{{ $revision->reason }}</p>
<p>{{ __('salary.signature') }}: ____________________</p>
@endsection

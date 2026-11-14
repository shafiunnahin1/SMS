@extends('pdf.layout')

{{-- D213 CAL.3: the exam seat plan, one room per page --}}
@section('content')
<style>
  table.sp { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.sp th, table.sp td { border: 1px solid #cccccc; padding: 4px; text-align: start; }
  table.sp th { background: {{ $theme['primary_color'] }}; color: #ffffff; }
  .room { page-break-after: always; } .room:last-child { page-break-after: auto; }
</style>
@foreach ($rooms as $room)
<div class="room">
  <h2>{{ __('pdf.seat_plan.title') }} — {{ $exam->name }}@if ($exam->program) ({{ $exam->program->name }})@endif</h2>
  <h3>{{ __('pdf.seat_plan.room') }}: {{ $room['name'] }} · {{ __('pdf.seat_plan.count', ['count' => count($room['seats'])]) }}</h3>
  <table class="sp">
    <thead><tr><th>{{ __('pdf.seat_plan.seat') }}</th><th>{{ __('pdf.seat_plan.roll') }}</th><th>{{ __('pdf.seat_plan.id') }}</th><th>{{ __('pdf.seat_plan.name') }}</th><th>{{ term('batch') }}</th></tr></thead>
    <tbody>
    @foreach ($room['seats'] as $s)
      <tr><td>{{ $s['seat_number'] }}</td><td>{{ $s['roll'] }}</td><td>{{ $s['code'] }}</td><td>{{ $s['name'] }}</td><td>{{ $s['batch'] }}</td></tr>
    @endforeach
    </tbody>
  </table>
</div>
@endforeach
@endsection

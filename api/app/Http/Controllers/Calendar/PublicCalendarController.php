<?php

namespace App\Http\Controllers\Calendar;

use App\Http\Controllers\Controller;
use App\Services\Calendar\CalendarService;
use Illuminate\Http\Request;

// D213 CAL.2: the institution's public website shows the month calendar without login - holidays, exam dates and the events
// meant for everyone that the admin marked public; no names of people.
class PublicCalendarController extends Controller
{
    public function show(Request $request, CalendarService $calendar)
    {
        $f = $request->validate(['month' => 'nullable|date_format:Y-m']);
        return response()->json(['success' => true, 'data' => $calendar->month($f['month'] ?? now()->format('Y-m'), null)]);
    }
}

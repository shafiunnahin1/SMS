<?php

namespace App\Http\Controllers\Library;

use App\Http\Controllers\Controller;
use App\Models\{Book, BookIssue, Student};
use App\Services\Library\LibraryService;
use Illuminate\Http\Request;

// D227 LIB.1: issue and return (admin, staff with staff.library.circulate), the lists (staff.library.read), the settings (admin),
// fine collection (admin, accountant - a fee receipt line) and waiver (admin), and the student's / parent's own read-only view
class LibraryIssueController extends Controller
{
    public function __construct(private LibraryService $library) {}

    /** POST /library/issue {book_id, student_id} */
    public function issue(Request $request)
    {
        $f = $request->validate(['book_id' => 'required|integer', 'student_id' => 'required|integer']);
        $row = $this->library->issue(Book::findOrFail($f['book_id']), Student::findOrFail($f['student_id']), $request->user());
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => LibraryService::row($row->load(['book:id,title', 'student.user:id,name']))], 201);
    }

    /** POST /library/return/{issueId} */
    public function return(string $issueId)
    {
        abort_unless(ctype_digit($issueId), 404);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => LibraryService::row($this->library->return(BookIssue::findOrFail($issueId))->load(['book:id,title', 'student.user:id,name']))]);
    }

    /** GET /library/issued - out now (issued or overdue) */
    public function issued() { return $this->list(BookIssue::whereIn('status', ['issued', 'overdue'])->orderBy('due_date')); }

    /** GET /library/overdue - past the due date and not back, plus returned ones with an unpaid fine */
    public function overdue()
    {
        return $this->list(BookIssue::where(fn ($q) => $q->whereIn('status', ['issued', 'overdue'])->where('due_date', '<', now()->toDateString())
            ->orWhere(fn ($w) => $w->where('status', 'returned')->where('fine_paid', false)->where('fine_amount', '>', 0)))->orderBy('due_date'), true);
    }

    /** GET /library/history/{studentId} */
    public function history(string $studentId)
    {
        abort_unless(ctype_digit($studentId), 404);
        $s = Student::findOrFail($studentId);
        return $this->list(BookIssue::where('student_id', $s->id)->orderByDesc('issue_date'));
    }

    /** GET|PUT /library/settings */
    public function settings() { return response()->json(['success' => true, 'data' => $this->library->settings()]); }

    public function updateSettings(Request $request)
    {
        $f = $request->validate(['loan_days' => 'required|integer|min:1|max:365', 'fine_per_day' => ['required', 'regex:/^\d{1,6}(\.\d{1,2})?$/']]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->library->saveSettings((int) $f['loan_days'], (string) $f['fine_per_day'])]);
    }

    /** POST /library/issues/{id}/collect-fine {method} - admin, accountant */
    public function collectFine(Request $request, int $id)
    {
        $issue = BookIssue::findOrFail($id);                                     // another institution's row: 404 before any validation
        $f = $request->validate(['method' => 'required|in:cash,bkash,nagad,bank,card,other']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['receipt_no' => $this->library->collectFine($issue, $f['method'])]]);
    }

    /** POST /library/issues/{id}/waive {reason} - admin */
    public function waive(Request $request, int $id)
    {
        $issue = BookIssue::findOrFail($id);
        $f = $request->validate(['reason' => 'required|string|max:255']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => LibraryService::row($this->library->waive($issue, $f['reason'])->load(['book:id,title', 'student.user:id,name']))]);
    }

    /** GET /student/library - the signed-in student's own */
    public function mine(Request $request)
    {
        $s = Student::where('user_id', $request->user()->id)->firstOrFail();
        return $this->list(BookIssue::where('student_id', $s->id)->orderByDesc('issue_date'));
    }

    /** GET /parent/children/{id}/library - the parent's own child */
    public function child(Request $request, int $id)
    {
        $s = Student::whereKey($id)->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail();
        return $this->list(BookIssue::where('student_id', $s->id)->orderByDesc('issue_date'));
    }

    private function list($q, bool $withFine = false)
    {
        $rows = $q->with(['book:id,title', 'student.user:id,name'])->limit(500)->get();
        return response()->json(['success' => true, 'data' => $rows->map(function ($i) use ($withFine) {
            $r = LibraryService::row($i);
            if ($withFine && $i->status !== 'returned') $r['fine_so_far'] = $this->library->fineFor($i, now());   // what it would be if returned today
            return $r;
        })->values()]);
    }
}

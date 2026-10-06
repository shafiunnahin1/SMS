<?php

namespace App\Http\Controllers\Shared;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

// The logged-in user's own in-app notifications (always through $user->notifications(), never all rows)
class NotificationController extends Controller
{
    public function index(Request $request)
    {
        $page = $request->user()->notifications()->latest()->paginate(min((int) $request->input('per_page', 20), 100));
        return response()->json([
            'success' => true,
            'data' => collect($page->items())->map(fn ($n) => ['id' => $n->id, 'data' => $n->data, 'read_at' => $n->read_at, 'created_at' => $n->created_at]),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(),
                       'total' => $page->total(), 'unread' => $request->user()->unreadNotifications()->count()],
        ]);
    }

    public function markRead(Request $request, string $id)
    {
        $request->user()->notifications()->whereKey($id)->firstOrFail()->markAsRead();
        return response()->json(['success' => true, 'message' => 'Marked as read']);
    }

    public function markAllRead(Request $request)
    {
        $request->user()->unreadNotifications()->update(['read_at' => now()]);
        return response()->json(['success' => true, 'message' => 'All marked as read']);
    }
}

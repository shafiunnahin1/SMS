<?php

namespace App\Http\Controllers\Library;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Book, BookIssue};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// D227 LIB.1: the book list (search, category). The admin and staff with staff.library.manage add and change books; a book is
// removed only if it was never issued, and its total copies never go below the copies out.
class LibraryBookController extends Controller
{
    /** GET /library/books?q=&category= */
    public function index(Request $request)
    {
        $f = $request->validate(['q' => 'nullable|string|max:100', 'category' => 'nullable|string|max:100']);
        $rows = Book::query()->when($f['q'] ?? null, fn ($q, $v) => $q->where(fn ($w) => $w->where('title', 'like', "%{$v}%")->orWhere('author', 'like', "%{$v}%")->orWhere('isbn', $v)))
            ->when($f['category'] ?? null, fn ($q, $v) => $q->where('category', $v))->orderBy('title')->paginate(50);
        return response()->json(['success' => true, 'data' => collect($rows->items())->map(fn ($b) => self::row($b))->values(),
            'meta' => ['total' => $rows->total(), 'categories' => Book::whereNotNull('category')->distinct()->orderBy('category')->pluck('category')]]);
    }

    /** POST /library/books */
    public function store(Request $request)
    {
        $f = $this->validated($request, true);
        $book = Book::create($f + ['available_copies' => $f['total_copies'] ?? 1, 'total_copies' => $f['total_copies'] ?? 1]);
        AuditLog::record('library.book_added', $book);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($book)], 201);
    }

    /** PUT /library/books/{id} */
    public function update(Request $request, int $id)
    {
        $f = $this->validated($request, false);
        $book = DB::transaction(function () use ($id, $f) {
            $book = Book::lockForUpdate()->findOrFail($id);
            if (array_key_exists('total_copies', $f)) {
                $out = (int) $book->total_copies - (int) $book->available_copies;
                if ((int) $f['total_copies'] < $out) throw \Illuminate\Validation\ValidationException::withMessages(['total_copies' => __('library.below_out', ['n' => $out])]);
                $f['available_copies'] = (int) $f['total_copies'] - $out;
            }
            $book->update($f);
            return $book;
        });
        AuditLog::record('library.book_updated', $book);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($book->fresh())]);
    }

    /** DELETE /library/books/{id} - only a book never issued */
    public function destroy(int $id)
    {
        $book = Book::findOrFail($id);
        if (BookIssue::where('book_id', $book->id)->exists()) throw new BusinessException(__('library.book_used'), 'book_in_use', 409);
        AuditLog::record('library.book_removed', $book);
        $book->delete();
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    private function validated(Request $request, bool $create): array
    {
        $r = $create ? 'required' : 'sometimes';
        return $request->validate(['title' => [$r, 'string', 'max:200'], 'author' => 'nullable|string|max:150', 'isbn' => 'nullable|string|max:20',
            'category' => 'nullable|string|max:100', 'total_copies' => 'sometimes|integer|min:1|max:10000', 'shelf_location' => 'nullable|string|max:50',
            'published_year' => 'nullable|integer|min:1901|max:2155', 'available_copies' => 'prohibited']);
    }

    public static function row(Book $b): array
    {
        return $b->only(['id', 'title', 'author', 'isbn', 'category', 'total_copies', 'available_copies', 'shelf_location', 'published_year']);
    }
}

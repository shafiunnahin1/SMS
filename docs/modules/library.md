# Library Module

## Database Tables
```sql
CREATE TABLE books (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(200) NOT NULL,
    author VARCHAR(150),
    isbn VARCHAR(20),
    category VARCHAR(100),
    total_copies INT DEFAULT 1,
    available_copies INT DEFAULT 1,
    shelf_location VARCHAR(50),
    published_year YEAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE book_issues (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    book_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    issued_by BIGINT UNSIGNED NOT NULL,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    return_date DATE NULL,
    fine_amount DECIMAL(8,2) DEFAULT 0,
    status ENUM('issued','returned','overdue') DEFAULT 'issued',
    FOREIGN KEY (book_id) REFERENCES books(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);
```

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /library/books | বই তালিকা (search, category filter) |
| POST | /library/books | নতুন বই যোগ |
| PUT | /library/books/{id} | বই তথ্য আপডেট |
| DELETE | /library/books/{id} | বই মুছে ফেলা |
| POST | /library/issue | বই ইস্যু করা |
| POST | /library/return/{issueId} | বই ফেরত নেওয়া |
| GET | /library/issued | বর্তমানে ইস্যু করা বইয়ের তালিকা |
| GET | /library/overdue | মেয়াদোত্তীর্ণ বইয়ের তালিকা |
| GET | /library/history/{studentId} | ছাত্রের বই ইতিহাস |

## Pages (Admin Panel)
- `/admin/library/books` — বই তালিকা, সার্চ, ফিল্টার
- `/admin/library/books/add` — নতুন বই যোগ
- `/admin/library/issue` — বই ইস্যু ফর্ম
- `/admin/library/issued` — বর্তমানে ইস্যু করা
- `/admin/library/overdue` — মেয়াদোত্তীর্ণ + fine

## LibraryService.php
```php
public function issueBook(int $bookId, int $studentId): BookIssue {
    $book = Book::findOrFail($bookId);
    if ($book->available_copies < 1) {
        throw new \Exception('বইটি বর্তমানে পাওয়া যাচ্ছে না');
    }
    $book->decrement('available_copies');
    return BookIssue::create([
        'book_id'    => $bookId,
        'student_id' => $studentId,
        'issued_by'  => auth()->id(),
        'issue_date' => now(),
        'due_date'   => now()->addDays(14), // ১৪ দিনের জন্য
    ]);
}

public function returnBook(int $issueId): BookIssue {
    $issue = BookIssue::findOrFail($issueId);
    $fine = 0;
    if (now()->gt($issue->due_date)) {
        $days = now()->diffInDays($issue->due_date);
        $fine = $days * 5; // প্রতিদিন ৫ টাকা fine
    }
    $issue->update(['return_date'=>now(), 'fine_amount'=>$fine, 'status'=>'returned']);
    $issue->book->increment('available_copies');
    return $issue;
}
```

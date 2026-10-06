# Hostel Module

## Database Tables
```sql
CREATE TABLE hostels (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    type ENUM('boys','girls') NOT NULL,
    total_rooms INT NOT NULL,
    warden_name VARCHAR(100),
    warden_phone VARCHAR(20)
);

CREATE TABLE hostel_rooms (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hostel_id BIGINT UNSIGNED NOT NULL,
    room_number VARCHAR(20) NOT NULL,
    capacity INT NOT NULL,
    current_occupancy INT DEFAULT 0,
    floor INT DEFAULT 1,
    monthly_fee DECIMAL(8,2),
    FOREIGN KEY (hostel_id) REFERENCES hostels(id)
);

CREATE TABLE hostel_allocations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    room_id BIGINT UNSIGNED NOT NULL,
    check_in_date DATE NOT NULL,
    check_out_date DATE NULL,
    status ENUM('active','checked_out') DEFAULT 'active',
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (room_id) REFERENCES hostel_rooms(id)
);
```

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | /hostel | হোস্টেল CRUD |
| GET/POST | /hostel/{id}/rooms | রুম CRUD |
| POST | /hostel/allocate | ছাত্রকে রুম বরাদ্দ |
| POST | /hostel/checkout/{id} | চেক-আউট |
| GET | /hostel/available-rooms | খালি রুমের তালিকা |

## Pages
- `/admin/hostel` — হোস্টেল তালিকা
- `/admin/hostel/:id/rooms` — রুম ম্যানেজমেন্ট
- `/admin/hostel/allocations` — বর্তমান বরাদ্দ

---

## API Endpoints (Detailed)
```
GET/POST  /hostel                        → Hostel list & create
PUT       /hostel/{id}                   → Update hostel info
GET/POST  /hostel/{id}/rooms             → Room list & create
PUT       /hostel/{id}/rooms/{roomId}    → Update room
POST      /hostel/allocate               → Allocate student to room
PATCH     /hostel/allocations/{id}/checkout → Check-out
GET       /hostel/available-rooms        → Available rooms (filter: hostel, floor)
GET       /hostel/allocations            → Current allocations list
GET       /hostel/reports/occupancy      → Occupancy report
```

## HostelService.php
```php
class HostelService
{
    public function allocate(int $studentId, int $roomId): HostelAllocation
    {
        $room = HostelRoom::findOrFail($roomId);

        if ($room->current_occupancy >= $room->capacity) {
            throw new BusinessException('এই রুমে আর জায়গা নেই', 'room_full');
        }

        // Is the student already in another room?
        HostelAllocation::where('student_id', $studentId)
                        ->where('status', 'active')
                        ->update(['status' => 'checked_out', 'check_out_date' => now()]);

        $allocation = HostelAllocation::create([
            'student_id'    => $studentId,
            'room_id'       => $roomId,
            'institution_id'     => app('currentInstitution')->id,
            'check_in_date' => now()->toDateString(),
            'status'        => 'active',
        ]);

        $room->increment('current_occupancy');
        return $allocation;
    }

    public function checkout(int $allocationId): void
    {
        $allocation = HostelAllocation::findOrFail($allocationId);
        $allocation->update([
            'status'          => 'checked_out',
            'check_out_date'  => now()->toDateString(),
        ]);
        $allocation->room->decrement('current_occupancy');
    }

    public function getAvailableRooms(int $hostelId): Collection
    {
        return HostelRoom::where('hostel_id', $hostelId)
                         ->whereColumn('current_occupancy', '<', 'capacity')
                         ->orderBy('floor')
                         ->orderBy('room_number')
                         ->get();
    }
}
```

## React Pages
- `/admin/hostel` — Hostel list (boys/girls filter, occupancy stats)
- `/admin/hostel/:id/rooms` — Room list with occupancy bar (6/10 ভরা)
- `/admin/hostel/allocations` — Current allocations, checkout button
- `/admin/hostel/allocate` — Student search → room select → allocate

## Fee Integration
```php
// Hostel monthly fee → added to fee_categories
// FeeCategory: name='Hostel Fee', amount=room.monthly_fee, frequency='monthly'
// Fee structure can be auto-created on student allocation
```

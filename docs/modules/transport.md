# Transport Module

## Database Tables
```sql
CREATE TABLE vehicles (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    number_plate VARCHAR(20) NOT NULL,
    capacity INT NOT NULL,
    driver_name VARCHAR(100),
    driver_phone VARCHAR(20),
    helper_name VARCHAR(100),
    status ENUM('active','maintenance','inactive') DEFAULT 'active'
);

CREATE TABLE transport_routes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    vehicle_id BIGINT UNSIGNED,
    morning_departure TIME,
    afternoon_departure TIME,
    monthly_fee DECIMAL(8,2),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
);

CREATE TABLE route_stops (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    route_id BIGINT UNSIGNED NOT NULL,
    stop_name VARCHAR(100) NOT NULL,
    pickup_time TIME,
    drop_time TIME,
    sequence INT NOT NULL,
    FOREIGN KEY (route_id) REFERENCES transport_routes(id)
);

CREATE TABLE student_transport (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    route_id BIGINT UNSIGNED NOT NULL,
    stop_id BIGINT UNSIGNED,
    direction ENUM('both','pickup_only','drop_only') DEFAULT 'both',
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (route_id) REFERENCES transport_routes(id)
);
```

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST/PUT | /transport/vehicles | গাড়ি CRUD |
| GET/POST/PUT | /transport/routes | রুট CRUD |
| POST | /transport/routes/{id}/stops | স্টপ যোগ |
| POST | /transport/assign | ছাত্রকে রুট অ্যাসাইন |
| GET | /transport/routes/{id}/students | রুটের ছাত্র তালিকা |

## Pages
- `/admin/transport/vehicles` — গাড়ি তালিকা
- `/admin/transport/routes` — রুট ম্যানেজমেন্ট
- `/admin/transport/routes/:id` — রুটের স্টপ ও ছাত্র
- `/parent/transport` — সন্তানের বাসের তথ্য, ড্রাইভার নম্বর

---

## TransportService.php
```php
class TransportService
{
    public function assignStudent(int $studentId, int $routeId, int $stopId, string $direction): void
    {
        // Remove previous assignment
        StudentTransport::where('student_id', $studentId)->delete();

        StudentTransport::create([
            'student_id' => $studentId,
            'route_id'   => $routeId,
            'stop_id'    => $stopId,
            'direction'  => $direction,
            'institution_id'  => app('currentInstitution')->id,
        ]);

        // Transport fee auto-assign
        $route = TransportRoute::find($routeId);
        if ($route->monthly_fee > 0) {
            // Add FeeCategory 'Transport Fee' (if not exists)
            $category = FeeCategory::firstOrCreate([
                'institution_id' => app('currentInstitution')->id,
                'name'      => 'Transport Fee',
            ], ['amount' => $route->monthly_fee, 'frequency' => 'monthly']);
        }
    }

    public function getRouteStudents(int $routeId): Collection
    {
        return StudentTransport::where('route_id', $routeId)
                               ->with(['student.program', 'stop'])
                               ->get()
                               ->sortBy('stop.sequence');
    }

    public function getStudentTransport(int $studentId): ?array
    {
        $assignment = StudentTransport::where('student_id', $studentId)
                                      ->with(['route.vehicle', 'route.stops', 'stop'])
                                      ->first();
        if (!$assignment) return null;

        return [
            'route'        => $assignment->route->name,
            'vehicle'      => $assignment->route->vehicle?->name,
            'driver_name'  => $assignment->route->vehicle?->driver_name,
            'driver_phone' => $assignment->route->vehicle?->driver_phone,
            'stop'         => $assignment->stop?->stop_name,
            'pickup_time'  => $assignment->stop?->pickup_time,
            'drop_time'    => $assignment->stop?->drop_time,
            'direction'    => $assignment->direction,
        ];
    }
}
```

## React Pages
- `/admin/transport/vehicles` — Vehicle CRUD + driver info
- `/admin/transport/routes` — Route CRUD + stop management
- `/admin/transport/routes/:id` — Route detail: stops timeline, student list
- `/admin/transport/assign` — Student → route assignment form
- `/parent/transport` — Child's bus info, driver number, stop time

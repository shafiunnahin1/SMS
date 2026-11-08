<?php

namespace App\Imports;

use App\Models\Attendance;
use Illuminate\Support\Facades\Validator;

// D193 MIG.1 kind=attendance: one day of one student (status present / absent / late / leave, or P / A / L / V). The batch is the
// student's main enrollment unless the file names one of the same class. Written directly - no absent SMS. Natural key (student,
// batch, date). Not money: undo removes the row.
final class AttendanceRowImporter extends RowImporter
{
    private const STATUS = ['present' => 'present', 'p' => 'present', 'absent' => 'absent', 'a' => 'absent', 'late' => 'late', 'l' => 'late', 'leave' => 'leave', 'v' => 'leave'];

    public function __construct(private Lookup $find) {}

    public function fields(): array { return ['student_id', 'date', 'status', 'batch', 'note']; }
    public function required(): array { return ['student_id', 'date', 'status']; }
    public function aliases(): array { return ['student' => 'student_id', 'student_code' => 'student_id', 'section' => 'batch', 'remark' => 'note']; }

    public function check(array $data): array
    {
        $v = Validator::make($data, ['student_id' => 'required|string', 'date' => 'required|date|before_or_equal:today', 'status' => 'required|string', 'note' => 'nullable|string|max:255']);
        if ($v->fails()) return $this->result('error', $v->errors()->first(), $data);
        $status = self::STATUS[mb_strtolower(trim($data['status']))] ?? null;
        if (!$status) return $this->result('error', __('errors.import_unknown', ['field' => 'status', 'value' => $data['status']]), $data);
        $student = $this->find->student($data['student_id']);
        $enr = $student?->primaryEnrollment;
        if (!$student || !$enr) return $this->result('error', __('errors.import_unknown', ['field' => 'student_id', 'value' => $data['student_id']]), $data);
        $batchId = $enr->batch_id;
        if (!empty($data['batch'])) {
            $b = $this->find->batch($enr->program()->first(), $data['batch']);
            if (!$b) return $this->result('error', __('errors.import_unknown', ['field' => 'batch', 'value' => $data['batch']]), $data);
            $batchId = $b->id;
        }
        if (!$batchId) return $this->result('error', __('errors.import_unknown', ['field' => 'batch', 'value' => '']), $data);
        $date = date('Y-m-d', strtotime($data['date']));
        if ($dup = $this->duplicate("{$student->id}|$batchId|$date", $data)) return $dup;
        if (Attendance::where('student_id', $student->id)->where('batch_id', $batchId)->whereDate('date', $date)->exists()) return $this->result('skipped', __('errors.import_exists'), $data);
        return $this->result('ok', null, $data + ['_a' => ['student_id' => $student->id, 'program_id' => $enr->program_id, 'batch_id' => $batchId, 'date' => $date,
            'status' => $status, 'note' => ($data['note'] ?? '') ?: null, 'taken_by' => null]]);
    }

    public function create(array $data): array
    {
        return ['attendances', Attendance::create($data['_a'])->id];
    }

    public function undo(string $table, int $id): ?string
    {
        Attendance::whereKey($id)->delete();
        return null;
    }
}

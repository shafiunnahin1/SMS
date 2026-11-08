<?php

namespace App\Imports;

// D193 MIG.1 (data-migration.md section 1): one kind of the import wizard. check() writes nothing (dry-run and the run's re-check);
// create() is called only for rows check() passed and returns [created_table, created_id]; undo() removes what create() made, or
// returns the reason it stays (a dependent row exists, or D32: money and results are never deleted - owner, 2026-11-07).
abstract class RowImporter
{
    protected array $seen = [];

    /** @return string[] */
    abstract public function fields(): array;

    /** @return string[] */
    abstract public function required(): array;

    /** @return array{status: 'ok'|'error'|'skipped', error: ?string, data: array} */
    abstract public function check(array $data): array;

    /** @return array{0: string, 1: int} */
    abstract public function create(array $data): array;

    /** null = removed; a string = why it stays */
    abstract public function undo(string $table, int $id): ?string;

    /** Header aliases a file may use for a field (lower-case, spaces -> _) */
    public function aliases(): array { return []; }

    protected function result(string $status, ?string $error, array $data): array
    {
        return ['status' => $status, 'error' => $error ? mb_substr($error, 0, 255) : null, 'data' => $data];
    }

    /** A row repeated inside the same file is an error the second time (the natural key) */
    protected function duplicate(string $key, array $data): ?array
    {
        if (isset($this->seen[$key])) return $this->result('error', __('errors.import_duplicate_row', ['row' => $this->seen[$key]]), $data);
        $this->seen[$key] = $data['_row'] ?? '?';
        return null;
    }

    public static function for(string $kind): self
    {
        return match ($kind) {
            'students' => app(StudentRowImporter::class),
            'teachers' => app(TeacherRowImporter::class),
            'fee_structure' => app(FeeStructureRowImporter::class),
            'fee_history' => app(FeeHistoryRowImporter::class),
            'results' => app(ResultRowImporter::class),
            'attendance' => app(AttendanceRowImporter::class),
        };
    }
}

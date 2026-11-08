<?php

namespace App\Imports;

use App\Models\{Batch, FeeCategory, Program, Student};

// D193 MIG.1: the names a file uses for a class, batch, fee head or student - an id or an exact name (the column collation ignores case); a name
// two rows share is ambiguous (null), never guessed.
final class Lookup
{
    private array $cache = [];

    public function program(string $v): ?Program
    {
        return $this->cache['p'][$v] ??= $this->one(Program::query(), $v);
    }

    public function batch(Program $p, string $v): ?Batch
    {
        return $this->cache['b'][$p->id][$v] ??= $this->one(Batch::where('program_id', $p->id), $v);
    }

    public function category(string $v): ?FeeCategory
    {
        return $this->cache['c'][$v] ??= $this->one(FeeCategory::query(), $v);
    }

    public function student(string $code): ?Student
    {
        return $this->cache['s'][$code] ??= Student::with('primaryEnrollment')->where('student_id', trim($code))->first();
    }

    private function one($q, string $v)
    {
        $v = trim($v);
        if ($v === '') return null;
        if (ctype_digit($v) && ($row = (clone $q)->find((int) $v))) return $row;
        $rows = (clone $q)->where('name', $v)->limit(2)->get();
        return $rows->count() === 1 ? $rows->first() : null;
    }
}

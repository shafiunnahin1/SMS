<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// D149: expand the existing English 1st Paper subject's class links only.
// Version-to-class mappings and question curriculum links are intentionally untouched.
return new class extends Migration
{
    private const CLASS_NAMES = [
        'Play', 'Nursery', 'KG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
        'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12',
    ];
    private const ADDED_CLASS_NAMES = ['Play', 'Nursery', 'KG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5'];

    public function up(): void
    {
        $subjectId = DB::table('qb_subjects')->where('name_en', 'English 1st Paper')->value('id');
        if (!$subjectId) return;

        $classes = DB::table('qb_class_levels')->whereIn('name_en', self::CLASS_NAMES)->pluck('id', 'name_en');
        $rows = [];
        foreach (self::CLASS_NAMES as $name) {
            if (isset($classes[$name])) $rows[] = ['qb_class_level_id' => $classes[$name], 'qb_subject_id' => $subjectId];
        }
        if ($rows) DB::table('qb_class_level_subject')->insertOrIgnore($rows);
    }

    public function down(): void
    {
        $subjectId = DB::table('qb_subjects')->where('name_en', 'English 1st Paper')->value('id');
        if (!$subjectId) return;

        $classIds = DB::table('qb_class_levels')->whereIn('name_en', self::ADDED_CLASS_NAMES)->pluck('id');
        DB::table('qb_class_level_subject')->where('qb_subject_id', $subjectId)
            ->whereIn('qb_class_level_id', $classIds)->delete();
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D200 SUBL.1: the (id, institution_id) identity keys schema.sql already declares on these parents, needed by the tenant-bound
// composite foreign keys of the leave-substitution tables (routines, users and institution_departments already have theirs)
return new class extends Migration
{
    private const KEYS = ['leave_applications' => 'unique_leave_application_tenant_identity', 'teachers' => 'unique_teacher_tenant_identity',
        'programs' => 'unique_program_tenant_identity', 'batches' => 'unique_batch_tenant_identity', 'subjects' => 'unique_subject_tenant_identity'];

    public function up(): void
    {
        foreach (self::KEYS as $table => $name) Schema::table($table, fn (Blueprint $t) => $t->unique(['id', 'institution_id'], $name));
    }

    public function down(): void
    {
        foreach (self::KEYS as $table => $name) Schema::table($table, fn (Blueprint $t) => $t->dropUnique($name));
    }
};

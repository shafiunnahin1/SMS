<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D200 SUBL.1: the current state of one dated cover occurrence of a teacher's leave (schema.sql `leave_substitution_slots`; D96/D99/D199)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_substitution_slots', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('leave_application_id');
            $t->unsignedBigInteger('routine_id');
            $t->unsignedBigInteger('original_teacher_id');
            $t->date('occurrence_date');
            $t->time('source_start_time');
            $t->time('source_end_time');
            $t->string('source_room_no', 20)->nullable();
            $t->unsignedBigInteger('substitute_teacher_id')->nullable();
            $t->enum('status', ['unassigned', 'nominated', 'offered', 'confirmed', 'cancelled'])->default('unassigned');
            $t->unsignedInteger('version')->default(1);
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->timestamp('updated_at')->nullable();
            $t->unique(['institution_id', 'leave_application_id', 'routine_id', 'occurrence_date'], 'unique_leave_substitution_occurrence');
            $t->unique(['id', 'institution_id'], 'unique_leave_substitution_slot_tenant_identity');
            $t->unique(['id', 'institution_id', 'leave_application_id'], 'unique_leave_substitution_slot_leave_identity');
            $t->index(['institution_id', 'leave_application_id', 'occurrence_date'], 'idx_leave_substitution_leave_date');
            $t->index(['institution_id', 'substitute_teacher_id', 'occurrence_date', 'status'], 'idx_leave_substitution_teacher_date');
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign(['leave_application_id', 'institution_id'], 'lss_leave_fk')->references(['id', 'institution_id'])->on('leave_applications');
            $t->foreign(['routine_id', 'institution_id'], 'lss_routine_fk')->references(['id', 'institution_id'])->on('routines');
            $t->foreign(['original_teacher_id', 'institution_id'], 'lss_original_teacher_fk')->references(['id', 'institution_id'])->on('teachers');
            $t->foreign(['substitute_teacher_id', 'institution_id'], 'lss_substitute_teacher_fk')->references(['id', 'institution_id'])->on('teachers');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_substitution_slots');
    }
};

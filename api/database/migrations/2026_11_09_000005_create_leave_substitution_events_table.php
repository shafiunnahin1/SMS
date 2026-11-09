<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D200 SUBL.1: the append-only history of every slot version (schema.sql `leave_substitution_events`; D96/D98/D99)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_substitution_events', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('leave_substitution_operation_id');
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('leave_substitution_slot_id');
            $t->unsignedBigInteger('leave_application_id');
            $t->unsignedInteger('version');
            $t->enum('result_status', ['unassigned', 'nominated', 'offered', 'confirmed', 'cancelled']);
            $t->enum('event_type', ['slot_created', 'leave_approved', 'nomination_set', 'nomination_cleared', 'offer_created', 'offer_accepted', 'offer_declined',
                'cover_replaced', 'cover_cleared', 'leave_rejected', 'leave_cancelled', 'source_invalidated', 'substitute_leave_invalidated', 'source_refreshed']);
            $t->unsignedBigInteger('user_id');
            $t->unsignedBigInteger('original_teacher_id');
            $t->unsignedBigInteger('source_program_id');
            $t->unsignedBigInteger('source_batch_id')->nullable();
            $t->unsignedBigInteger('source_subject_id');
            $t->unsignedBigInteger('substitute_teacher_id')->nullable();
            $t->unsignedBigInteger('department_id')->nullable();
            $t->date('occurrence_date');
            $t->time('source_start_time');
            $t->time('source_end_time');
            $t->string('source_room_no', 20)->nullable();
            $t->string('reason_code', 40)->nullable();
            $t->string('reason_note', 255)->nullable();
            $t->string('idempotency_key', 128);
            $t->char('payload_sha256', 64);
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->unique(['institution_id', 'leave_substitution_slot_id', 'version'], 'unique_leave_substitution_event_version');
            $t->unique(['id', 'institution_id'], 'unique_leave_substitution_event_tenant_identity');
            $t->unique(['institution_id', 'user_id', 'idempotency_key'], 'unique_leave_substitution_event_request');
            $t->unique(['institution_id', 'leave_substitution_operation_id', 'leave_substitution_slot_id'], 'unique_leave_substitution_operation_slot');
            $t->index(['institution_id', 'leave_application_id', 'occurrence_date', 'id'], 'idx_leave_substitution_events_leave');
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign(['leave_substitution_operation_id', 'institution_id', 'user_id'], 'lse_operation_fk')->references(['id', 'institution_id', 'user_id'])->on('leave_substitution_operations');
            $t->foreign(['leave_substitution_slot_id', 'institution_id', 'leave_application_id'], 'lse_slot_fk')->references(['id', 'institution_id', 'leave_application_id'])->on('leave_substitution_slots');
            $t->foreign(['leave_application_id', 'institution_id'], 'lse_leave_fk')->references(['id', 'institution_id'])->on('leave_applications');
            $t->foreign(['user_id', 'institution_id'], 'lse_user_fk')->references(['id', 'institution_id'])->on('users');
            $t->foreign(['source_program_id', 'institution_id'], 'lse_program_fk')->references(['id', 'institution_id'])->on('programs');
            $t->foreign(['source_batch_id', 'institution_id'], 'lse_batch_fk')->references(['id', 'institution_id'])->on('batches');
            $t->foreign(['source_subject_id', 'institution_id'], 'lse_subject_fk')->references(['id', 'institution_id'])->on('subjects');
            $t->foreign(['original_teacher_id', 'institution_id'], 'lse_original_teacher_fk')->references(['id', 'institution_id'])->on('teachers');
            $t->foreign(['substitute_teacher_id', 'institution_id'], 'lse_substitute_teacher_fk')->references(['id', 'institution_id'])->on('teachers');
            $t->foreign(['department_id', 'institution_id'], 'lse_department_fk')->references(['id', 'institution_id'])->on('institution_departments');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_substitution_events');
    }
};

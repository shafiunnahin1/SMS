<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D197 AAD.3: a parent's (or a staff-entered) leave request for a student (schema.sql `student_leave_requests`;
// docs/modules/academics-advanced.md section 5)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_leave_requests', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('student_id');
            $table->date('from_date');
            $table->date('to_date');
            $table->integer('total_days');
            $table->string('reason', 500)->nullable();
            $table->string('attachment', 255)->nullable();
            $table->string('method', 10)->default('portal');
            $table->enum('status', ['pending', 'approved', 'rejected', 'cancelled'])->default('pending');
            $table->unsignedBigInteger('requested_by')->nullable();
            $table->unsignedBigInteger('decided_by')->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->string('decision_note', 255)->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_leave_requests');
    }
};

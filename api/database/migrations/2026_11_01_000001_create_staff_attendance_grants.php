<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D169 (4) STW.5: the head / admin or a batch's teacher in charge lets one institution staff member take and correct that batch's
// attendance until revoked; one active grant per batch and staff member (kept by the service under the batch row lock)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_attendance_grants', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('batch_id');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('granted_by');
            $table->unsignedBigInteger('revoked_by')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
            $table->index(['institution_id', 'batch_id', 'user_id', 'revoked_at'], 'idx_staff_att_grants_active');
            $table->index(['institution_id', 'user_id'], 'idx_staff_att_grants_user');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('batch_id')->references('id')->on('batches');
            $table->foreign('user_id')->references('id')->on('users');
            $table->foreign('granted_by')->references('id')->on('users');
            $table->foreign('revoked_by')->references('id')->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_attendance_grants');
    }
};

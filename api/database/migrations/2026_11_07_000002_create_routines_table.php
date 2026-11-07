<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D193 RTN.1: the weekly class routine (schema.sql `routines`; docs/modules/routine.md)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('routines', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('program_id');
            $table->unsignedBigInteger('batch_id')->nullable();
            $table->unsignedBigInteger('subject_id');
            $table->unsignedBigInteger('teacher_id');
            $table->enum('day_of_week', ['sat', 'sun', 'mon', 'tue', 'wed', 'thu']);
            $table->time('start_time');
            $table->time('end_time');
            $table->string('room_no', 20)->nullable();
            $table->unique(['id', 'institution_id'], 'unique_routine_tenant_identity');
            $table->foreign('institution_id')->references('id')->on('institutions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('routines');
    }
};

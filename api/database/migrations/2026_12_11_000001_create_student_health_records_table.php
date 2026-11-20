<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D235 HLT.1: one health record per student - a child's sensitive data (extended-features.md section 6; schema.sql `student_health_records`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_health_records', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('student_id');
            $t->decimal('height_cm', 5, 1)->nullable();
            $t->decimal('weight_kg', 5, 1)->nullable();
            $t->string('blood_group', 5)->nullable();
            $t->string('vision_left', 20)->nullable();
            $t->string('vision_right', 20)->nullable();
            $t->text('medical_conditions')->nullable();
            $t->string('emergency_contact', 100)->nullable();
            $t->string('emergency_phone', 20)->nullable();
            $t->string('doctor_name', 100)->nullable();
            $t->string('doctor_phone', 20)->nullable();
            $t->date('last_checkup_date')->nullable();
            $t->text('notes')->nullable();
            $t->timestamp('updated_at')->nullable()->useCurrent()->useCurrentOnUpdate();
            $t->unique('student_id', 'unique_health');
            $t->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_health_records');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D233 HST.3: a meal a mess member did not take (schema.sql `hostel_meal_offs`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hostel_meal_offs', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('hostel_id');
            $t->unsignedBigInteger('student_id');
            $t->date('date');
            $t->enum('meal', ['breakfast', 'lunch', 'dinner']);
            $t->unsignedBigInteger('marked_by')->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->unique(['institution_id', 'student_id', 'date', 'meal'], 'unique_hostel_meal_off');
            $t->foreign('hostel_id')->references('id')->on('hostels');
            $t->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hostel_meal_offs');
    }
};

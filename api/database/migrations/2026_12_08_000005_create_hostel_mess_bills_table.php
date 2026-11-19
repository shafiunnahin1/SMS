<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D233 HST.3: a member's frozen bill of a closed mess month, or an adjustment to it (schema.sql `hostel_mess_bills`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hostel_mess_bills', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('mess_month_id');
            $t->unsignedBigInteger('student_id');
            $t->enum('kind', ['bill', 'adjustment'])->default('bill');
            $t->decimal('meals', 8, 2)->default(0);
            $t->decimal('amount', 10, 2);
            $t->string('note', 255)->nullable();
            $t->unsignedBigInteger('created_by')->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->index(['institution_id', 'student_id'], 'idx_hostel_mess_bills_student');
            $t->foreign('mess_month_id')->references('id')->on('hostel_mess_months');
            $t->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hostel_mess_bills');
    }
};

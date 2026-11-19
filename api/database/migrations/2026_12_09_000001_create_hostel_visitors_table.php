<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D233 HST.4: the hostel's visitor log (schema.sql `hostel_visitors`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hostel_visitors', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('hostel_id');
            $t->unsignedBigInteger('student_id');
            $t->string('visitor_name', 100);
            $t->string('relation', 50)->nullable();
            $t->string('phone', 20)->nullable();
            $t->string('purpose', 255)->nullable();
            $t->timestamp('in_at');
            $t->timestamp('out_at')->nullable();
            $t->unsignedBigInteger('recorded_by')->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->index(['institution_id', 'hostel_id', 'in_at'], 'idx_hostel_visitors_day');
            $t->foreign('hostel_id')->references('id')->on('hostels');
            $t->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hostel_visitors');
    }
};

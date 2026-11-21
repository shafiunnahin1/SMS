<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D240 VIS.1: the visitor log (extended-features.md section 8; schema.sql `visitor_logs` with its R10 ALTERs `department`, `photo`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('visitor_logs', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->string('visitor_name', 100);
            $t->string('visitor_phone', 20)->nullable();
            $t->string('purpose', 150);
            $t->string('whom_to_meet', 100)->nullable();
            $t->enum('id_type', ['nid', 'passport', 'driving_license', 'other'])->nullable()->default('nid');
            $t->string('id_number', 50)->nullable();
            $t->timestamp('check_in')->nullable()->useCurrent();
            $t->timestamp('check_out')->nullable();
            $t->string('badge_no', 20)->nullable();
            $t->unsignedBigInteger('created_by');
            $t->string('department', 100)->nullable();
            $t->string('photo', 255)->nullable();
            $t->index(['institution_id', 'check_in'], 'idx_visitor_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('visitor_logs');
    }
};

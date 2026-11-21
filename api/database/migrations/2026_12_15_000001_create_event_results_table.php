<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D242 EVT.1: competition results of an event (advanced-features.md section 9; schema.sql `event_results` with its later `remarks` column and index)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('event_results', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('event_id');
            $t->unsignedBigInteger('student_id');
            $t->integer('position')->nullable();
            $t->string('award', 100)->nullable();
            $t->integer('points')->nullable()->default(0);
            $t->boolean('certificate_issued')->nullable()->default(false);
            $t->text('remarks')->nullable();   // R10 ALTER
            $t->index('event_id', 'idx_event_results_event');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('event_results');
    }
};

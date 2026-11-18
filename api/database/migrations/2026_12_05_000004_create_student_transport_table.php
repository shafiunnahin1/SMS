<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D229 TRN.1: a student on a route; started_on / ended_on (D229) - a change ends the row, never deletes it (schema.sql `student_transport`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_transport', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('student_id');
            $t->unsignedBigInteger('route_id');
            $t->unsignedBigInteger('stop_id')->nullable();
            $t->enum('direction', ['both', 'pickup_only', 'drop_only'])->nullable()->default('both');
            $t->date('started_on');
            $t->date('ended_on')->nullable();
            $t->foreign('student_id')->references('id')->on('students');
            $t->foreign('route_id')->references('id')->on('transport_routes');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_transport');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D233 HST.1: a room of a hostel with its seats and monthly fee (schema.sql `hostel_rooms`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hostel_rooms', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('hostel_id');
            $t->string('room_number', 20);
            $t->integer('capacity');
            $t->integer('current_occupancy')->nullable()->default(0);
            $t->integer('floor')->nullable()->default(1);
            $t->decimal('monthly_fee', 8, 2)->nullable();
            $t->foreign('hostel_id')->references('id')->on('hostels');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hostel_rooms');
    }
};

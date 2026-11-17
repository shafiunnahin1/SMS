<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D229 TRN.1: the institution's vehicles (transport.md; schema.sql `vehicles` with its GPS columns, unused until live location)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vehicles', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->string('name', 100);
            $t->string('number_plate', 20);
            $t->integer('capacity');
            $t->string('driver_name', 100)->nullable();
            $t->string('driver_phone', 20)->nullable();
            $t->string('helper_name', 100)->nullable();
            $t->enum('status', ['active', 'maintenance', 'inactive'])->nullable()->default('active');
            $t->string('gps_device_id', 50)->nullable();
            $t->string('gps_api_key', 100)->nullable();
            $t->index('institution_id', 'idx_vehicles_inst');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicles');
    }
};

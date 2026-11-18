<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D229 TRN.1: a bus route with its vehicle, departure times and monthly fee (schema.sql `transport_routes`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transport_routes', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->string('name', 100);
            $t->unsignedBigInteger('vehicle_id')->nullable();
            $t->time('morning_departure')->nullable();
            $t->time('afternoon_departure')->nullable();
            $t->decimal('monthly_fee', 8, 2)->nullable();
            $t->foreign('vehicle_id')->references('id')->on('vehicles');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transport_routes');
    }
};

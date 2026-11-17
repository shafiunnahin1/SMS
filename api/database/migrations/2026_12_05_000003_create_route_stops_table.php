<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D229 TRN.1: a stop on a route, in order, with pickup and drop times (schema.sql `route_stops`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('route_stops', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('route_id');
            $t->string('stop_name', 100);
            $t->time('pickup_time')->nullable();
            $t->time('drop_time')->nullable();
            $t->integer('sequence');
            $t->foreign('route_id')->references('id')->on('transport_routes');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('route_stops');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D233 HST.1: a hostel of the institution (hostel.md; schema.sql `hostels`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hostels', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->string('name', 100);
            $t->enum('type', ['boys', 'girls']);
            $t->integer('total_rooms');
            $t->string('warden_name', 100)->nullable();
            $t->string('warden_phone', 20)->nullable();
            $t->index('institution_id', 'idx_hostels_inst');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hostels');
    }
};

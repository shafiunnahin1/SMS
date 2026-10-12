<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D69 (QB.11): which qbank row became which row here - qb:import-from-qbank writes it, so a second run imports nothing twice.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qb_import_map', function (Blueprint $t) {
            $t->id();
            $t->string('source', 30);
            $t->string('source_table', 60);
            $t->unsignedBigInteger('source_id');
            $t->string('target_table', 60);
            $t->unsignedBigInteger('target_id');
            $t->timestamp('created_at')->nullable();
            $t->unique(['source', 'source_table', 'source_id'], 'unique_qb_import_map');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qb_import_map');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D165 (1) ST.1: the one platform institution that holds every self-registered student (no institutional modules, no admin)
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('institutions', function (Blueprint $table) {
            $table->enum('institution_type', ['school', 'college', 'coaching', 'private_batch', 'learners'])->default('school')->change();
        });
    }

    public function down(): void
    {
        Schema::table('institutions', function (Blueprint $table) {
            $table->enum('institution_type', ['school', 'college', 'coaching', 'private_batch'])->default('school')->change();
        });
    }
};

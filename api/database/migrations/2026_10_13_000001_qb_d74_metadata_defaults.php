<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('qb_questions', function (Blueprint $table) {
            $table->enum('language', ['bn', 'en', 'und'])->default('und')->change();
            $table->enum('content_mode', ['plain_text', 'rich_math', 'mixed'])->default('mixed')->change();
        });
    }

    public function down(): void
    {
        if (DB::table('qb_questions')->where('language', 'und')->exists()) {
            throw new RuntimeException('Cannot roll back D74 while und language metadata exists.');
        }

        Schema::table('qb_questions', function (Blueprint $table) {
            $table->enum('language', ['bn', 'en'])->default('bn')->change();
            $table->enum('content_mode', ['plain_text', 'rich_math', 'mixed'])->default('plain_text')->change();
        });
    }
};
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// docs/database/migrations.md: device + hashed IP for the session list (GET /auth/sessions). The IP is never stored in plain text.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $table) {
            $table->string('device', 120)->nullable();
            $table->char('ip_hash', 64)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $table) {
            $table->dropColumn(['device', 'ip_hash']);
        });
    }
};

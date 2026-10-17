<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D59: the institution's own sender ID on BulkSMSBD may be a 13-digit number (docs/database/schema.sql)
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('institutions', fn (Blueprint $t) => $t->string('sms_sender_id', 20)->nullable()->change());
    }

    public function down(): void
    {
        Schema::table('institutions', fn (Blueprint $t) => $t->string('sms_sender_id', 11)->nullable()->change());
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};

// D208 SMSC.1: an SMS made in manual mode waits as `pending` (sent later by hand, or `discarded`); `event_key` names the event
// that made it (schema.sql `sms_logs`)
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE sms_logs MODIFY status ENUM('sent','failed','pending','discarded') DEFAULT 'sent'");
        Schema::table('sms_logs', function (Blueprint $t) {
            $t->string('event_key', 40)->nullable()->after('route');
        });
    }

    public function down(): void
    {
        Schema::table('sms_logs', function (Blueprint $t) {
            $t->dropColumn('event_key');
        });
        DB::statement("UPDATE sms_logs SET status = 'failed' WHERE status IN ('pending', 'discarded')");
        DB::statement("ALTER TABLE sms_logs MODIFY status ENUM('sent','failed') DEFAULT 'sent'");
    }
};

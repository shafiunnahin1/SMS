<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// D56-D59 (owner, 2026-10-10; docs/database/schema.sql): the SMS wallet is money (taka), each charge is a ledger row in taka;
// an institution may use its own BulkSMSBD API (encrypted key) with the universal / own toggles; platform_settings holds the
// universal API settings and the rate per SMS part. Old prepaid SMS counts are converted at the old unit price of 0.40.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('institutions', function (Blueprint $t) {
            $t->decimal('sms_balance', 10, 2)->default(0)->change();
        });
        DB::table('institutions')->update(['sms_balance' => DB::raw('sms_balance * 0.40')]);   // guard:allow(C7) one-off conversion of every institution, D56
        Schema::table('institutions', function (Blueprint $t) {
            $t->text('sms_api_key')->nullable();
            $t->boolean('sms_universal_enabled')->default(true);
            $t->boolean('sms_own_enabled')->default(false);
        });
        Schema::table('sms_credit_transactions', function (Blueprint $t) {
            $t->integer('quantity')->default(0)->change();
            $t->decimal('balance_after', 10, 2)->change();
            $t->decimal('amount', 10, 2)->default(0);
        });
        Schema::table('sms_logs', function (Blueprint $t) {
            $t->decimal('cost', 8, 2)->default(0);
            $t->string('route', 10)->default('universal');
        });
        Schema::create('platform_settings', function (Blueprint $t) {
            $t->id();
            $t->string('setting_key', 80)->unique('unique_setting_key');
            $t->json('value');
            $t->unsignedBigInteger('updated_by')->nullable();
            $t->timestamp('updated_at')->nullable()->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_settings');
        Schema::table('sms_logs', fn (Blueprint $t) => $t->dropColumn(['cost', 'route']));
        Schema::table('sms_credit_transactions', function (Blueprint $t) {
            $t->dropColumn('amount');
            $t->integer('balance_after')->change();
            $t->integer('quantity')->change();
        });
        Schema::table('institutions', fn (Blueprint $t) => $t->dropColumn(['sms_api_key', 'sms_universal_enabled', 'sms_own_enabled']));
        Schema::table('institutions', fn (Blueprint $t) => $t->integer('sms_balance')->default(0)->change());
    }
};

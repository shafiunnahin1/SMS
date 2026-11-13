<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D203 REF.1: who referred an application (schema.sql `admission_leads.referred_by`): the teacher / staff user who filled it in
// their own account; NULL = no referrer (always NULL from the public form).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('admission_leads', function (Blueprint $t) {
            $t->unsignedBigInteger('referred_by')->nullable()->after('created_by');
            $t->foreign('referred_by')->references('id')->on('users');
            $t->index(['institution_id', 'referred_by'], 'idx_leads_referrer');
            // schema.sql's idx_leads_phone, missed by the PUB.1 migration: the public form's 24-hour duplicate check reads it
            $t->index(['institution_id', 'phone', 'created_at'], 'idx_leads_phone');
        });
    }

    public function down(): void
    {
        Schema::table('admission_leads', function (Blueprint $t) {
            $t->dropForeign(['referred_by']);
            // MySQL backs the institution_id foreign key with one of the two indexes below: give it back its own index first
            $t->index('institution_id', 'admission_leads_institution_id_foreign');
            $t->dropIndex('idx_leads_referrer');
            $t->dropIndex('idx_leads_phone');
            $t->dropColumn('referred_by');
        });
    }
};

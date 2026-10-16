<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $t) {
            $t->unique(['id', 'institution_id'], 'unique_users_id_institution');
            $t->enum('role', ['super_admin', 'admin', 'teacher', 'student', 'parent', 'accountant', 'content_writer', 'content_moderator', 'institution_staff'])->change();
        });
    }

    public function down(): void
    {
        // Keep the additive role value: rollback must never coerce existing staff identities.
        Schema::table('users', fn (Blueprint $t) => $t->dropUnique('unique_users_id_institution'));
    }
};

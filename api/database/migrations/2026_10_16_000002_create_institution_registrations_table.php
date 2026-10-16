<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D90: canonical docs/database/schema.sql; append-only foundation.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('institution_registrations', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('first_admin_id');
            $t->string('source', 20);
            $t->string('review_status', 20);
            $t->unsignedBigInteger('reviewed_by')->nullable();
            $t->timestamp('reviewed_at')->nullable();
            $t->string('rejection_reason', 255)->nullable();
            $t->timestamp('created_at')->useCurrent();
            $t->timestamp('updated_at')->nullable();
            $t->unique(['institution_id'], 'unique_registration_institution');
            $t->foreign(['institution_id'])->references(['id'])->on('institutions');
            $t->foreign(['first_admin_id','institution_id'])->references(['id','institution_id'])->on('users');
            $t->foreign(['reviewed_by'])->references(['id'])->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('institution_registrations');
    }
};

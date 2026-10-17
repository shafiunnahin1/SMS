<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D90: canonical docs/database/schema.sql; append-only foundation.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_activation_requests', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('user_id');
            $t->char('public_id', 36);
            $t->string('purpose', 30);
            $t->unsignedInteger('generation');
            $t->string('channel', 10);
            $t->char('contact_hash', 64);
            $t->unsignedBigInteger('otp_token_id')->nullable();
            $t->unsignedBigInteger('authorized_by')->nullable();
            $t->string('status', 20);
            $t->timestamp('expires_at');
            $t->timestamp('contact_verified_at')->nullable();
            $t->timestamp('consumed_at')->nullable();
            $t->timestamp('created_at')->useCurrent();
            $t->timestamp('updated_at')->nullable();
            $t->unique(['institution_id','public_id'], 'unique_activation_request_public');
            $t->unique(['institution_id','user_id','purpose','generation'], 'unique_activation_request_generation');
            $t->index(['institution_id','user_id','purpose','status'], 'idx_activation_request_pending');
            $t->foreign(['institution_id'])->references(['id'])->on('institutions');
            $t->foreign(['user_id','institution_id'])->references(['id','institution_id'])->on('users');
            $t->foreign(['otp_token_id'])->references(['id'])->on('otp_tokens');
            $t->foreign(['authorized_by'])->references(['id'])->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_activation_requests');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id')->nullable();
            $table->unsignedBigInteger('user_id');
            $table->string('action', 100);
            $table->string('model', 50)->nullable();
            $table->unsignedBigInteger('model_id')->nullable();
            $table->json('old_data')->nullable();
            $table->json('new_data')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();

            $table->index(['institution_id', 'created_at'], 'idx_audit_inst_created');
            $table->index(['model', 'model_id', 'created_at'], 'idx_audit_model');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};

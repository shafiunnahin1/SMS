<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id')->nullable();
            $table->string('name', 100);
            $table->string('email', 100)->nullable();
            $table->string('phone', 20)->nullable();
            $table->string('username', 50)->nullable();
            $table->string('password', 255);
            $table->enum('role', ['super_admin', 'admin', 'teacher', 'student', 'parent', 'accountant']);
            $table->string('avatar', 255)->nullable();
            $table->boolean('is_active')->nullable()->default(1);
            $table->timestamp('last_login_at')->nullable();
            $table->string('locale', 5)->nullable();
            $table->integer('failed_login_attempts')->default(0);
            $table->timestamp('locked_until')->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->timestamp('deleted_at')->nullable();
            $table->string('fcm_token', 255)->nullable();
            $table->boolean('must_change_password')->nullable()->default(0);
            $table->json('notification_preferences')->nullable();
            $table->boolean('two_factor_enabled')->nullable()->default(0);
            $table->string('whatsapp_number', 20)->nullable();
            $table->boolean('whatsapp_enabled')->nullable()->default(0);
            $table->string('name_alt', 150)->nullable();
            $table->json('ui_preferences')->nullable();

            $table->unique(['institution_id', 'email'], 'unique_user_email');
            $table->unique(['institution_id', 'phone'], 'unique_user_phone');
            $table->unique(['institution_id', 'username'], 'unique_user_username');
            $table->index(['institution_id', 'role'], 'idx_users_institution_role');
            $table->foreign('institution_id')->references('id')->on('institutions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};

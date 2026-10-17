<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('institutions', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('slug', 100)->unique();
            $table->enum('institution_type', ['school', 'college', 'coaching', 'private_batch'])->default('school');
            $table->json('enabled_modules')->nullable();
            $table->json('terminology')->nullable();
            $table->json('settings')->nullable();
            $table->integer('sms_balance')->default(0);
            $table->string('sms_sender_id', 11)->nullable();
            $table->enum('sms_sender_status', ['none', 'pending', 'approved', 'rejected'])->default('none');
            $table->string('sms_sender_note', 255)->nullable();
            $table->boolean('onboarding_completed')->nullable()->default(0);
            $table->integer('onboarding_step')->nullable()->default(1);
            $table->text('address')->nullable();
            $table->string('phone', 20)->nullable();
            $table->string('email', 100)->nullable();
            $table->unsignedBigInteger('subscription_plan_id')->nullable();
            $table->timestamp('subscription_expires_at')->nullable();
            $table->enum('status', ['trial', 'active', 'expired', 'suspended', 'inactive'])->nullable()->default('trial');
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->unsignedBigInteger('parent_institution_id')->nullable();
            $table->string('branch_name', 100)->nullable();
            $table->boolean('is_head_office')->nullable()->default(0);
            $table->string('primary_color', 7)->nullable()->default('#185FA5');
            $table->string('secondary_color', 7)->nullable()->default('#0F6E56');
            $table->string('accent_color', 7)->nullable()->default('#E67E22');
            $table->string('logo_path', 255)->nullable();
            $table->string('favicon_path', 255)->nullable();
            $table->enum('theme_mode', ['light', 'dark', 'auto'])->nullable()->default('light');
            $table->unsignedBigInteger('theme_updated_by')->nullable();
            $table->timestamp('theme_updated_at')->nullable();
            $table->unsignedBigInteger('theme_preset_id')->nullable();
            $table->string('layout_key', 30)->nullable();
            $table->string('ui_pack', 30)->nullable();
            $table->json('theme_tokens')->nullable();

            $table->foreign('subscription_plan_id')->references('id')->on('subscription_plans');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('institutions');
    }
};

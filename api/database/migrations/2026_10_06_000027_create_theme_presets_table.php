<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('theme_presets', function (Blueprint $table) {
            $table->id();
            $table->string('key', 50)->unique();
            $table->string('name', 100);
            $table->string('description', 255)->nullable();
            $table->string('layout_key', 30)->default('sidebar-classic');
            $table->string('ui_pack', 30)->default('classic');
            $table->string('primary_color', 7);
            $table->string('secondary_color', 7);
            $table->string('accent_color', 7);
            $table->enum('theme_mode', ['light', 'dark', 'auto'])->nullable()->default('light');
            $table->json('tokens');
            $table->string('preview_image', 255)->nullable();
            $table->json('allowed_types')->nullable();
            $table->boolean('is_premium')->nullable()->default(0);
            $table->boolean('is_active')->nullable()->default(1);
            $table->integer('sort_order')->nullable()->default(0);
            $table->timestamp('created_at')->nullable()->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('theme_presets');
    }
};

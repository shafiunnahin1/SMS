<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscription_plans', function (Blueprint $table) {
            $table->id();
            $table->string('name', 50);
            $table->decimal('price', 10, 2);
            $table->integer('duration_days');
            $table->integer('max_students')->nullable()->default(-1);
            $table->integer('max_teachers')->nullable()->default(-1);
            $table->integer('max_sms')->nullable()->default(1000);
            $table->enum('institution_type', ['school', 'college', 'coaching', 'private_batch'])->nullable();
            $table->integer('max_batches')->nullable()->default(-1);
            $table->integer('sort_order')->nullable()->default(0);
            $table->json('features')->nullable();
            $table->boolean('is_active')->nullable()->default(1);
            $table->timestamp('created_at')->nullable()->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_plans');
    }
};

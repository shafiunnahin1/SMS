<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_credit_transactions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->enum('type', ['purchase', 'usage', 'adjustment', 'refund']);
            $table->integer('quantity');
            $table->integer('balance_after');
            $table->string('reference', 100)->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();

            $table->index(['institution_id', 'created_at'], 'idx_sms_credit_inst_created');
            $table->foreign('institution_id')->references('id')->on('institutions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_credit_transactions');
    }
};

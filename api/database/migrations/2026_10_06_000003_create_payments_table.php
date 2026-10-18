<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->decimal('amount', 10, 2);
            $table->enum('method', ['bkash', 'nagad', 'card', 'cash', 'ssl', 'coupon']);
            $table->string('trx_id', 100)->nullable()->unique();
            $table->enum('status', ['pending', 'completed', 'failed', 'refunded'])->nullable()->default('pending');
            $table->timestamp('paid_at')->nullable();
            $table->string('invoice_no', 50)->nullable()->unique();
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->decimal('refunded_amount', 10, 2)->default(0);
            $table->string('refund_note', 255)->nullable();

            $table->foreign('institution_id')->references('id')->on('institutions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};

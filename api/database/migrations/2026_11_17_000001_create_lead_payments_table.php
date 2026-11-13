<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D209 ACY.2: application-fee payments (schema.sql `lead_payments`): cash at the office (received_by) or online (online_payment_id);
// never deleted - a mistake is a negative reversal row (D32)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lead_payments', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('lead_id');
            $t->unsignedBigInteger('online_payment_id')->nullable();
            $t->string('method', 10)->default('online');
            $t->unsignedBigInteger('received_by')->nullable();
            $t->decimal('amount', 10, 2);
            $t->string('receipt_no', 30);
            $t->timestamp('paid_at')->nullable();
            $t->unique(['institution_id', 'receipt_no'], 'unique_lead_receipt');
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('lead_id')->references('id')->on('admission_leads');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lead_payments');
    }
};

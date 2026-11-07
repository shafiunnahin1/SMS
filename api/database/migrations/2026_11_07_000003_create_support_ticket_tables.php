<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D193 SUP.1: support tickets between an institution and the platform (schema.sql `support_tickets`, `support_ticket_messages`;
// docs/modules/platform-ops.md section 1)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('support_tickets', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('ticket_no', 20);
            $table->string('subject', 150);
            $table->string('category', 20)->default('general');
            $table->enum('priority', ['low', 'normal', 'high', 'urgent'])->default('normal');
            $table->enum('status', ['open', 'pending_customer', 'pending_platform', 'resolved', 'closed'])->default('open');
            $table->unsignedBigInteger('created_by');
            $table->unsignedBigInteger('assigned_to')->nullable();
            $table->timestamp('first_response_due_at')->nullable();
            $table->timestamp('first_responded_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->tinyInteger('rating')->nullable();
            $table->string('rating_note', 255)->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->timestamp('updated_at')->nullable()->useCurrent();
            $table->unique('ticket_no', 'unique_ticket_no');
            $table->foreign('institution_id')->references('id')->on('institutions');
        });
        Schema::create('support_ticket_messages', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('ticket_id');
            $table->string('author_type', 10);
            $table->unsignedBigInteger('author_id');
            $table->text('body');
            $table->boolean('is_internal')->default(false);
            $table->json('attachments')->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('ticket_id')->references('id')->on('support_tickets');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_ticket_messages');
        Schema::dropIfExists('support_tickets');
    }
};

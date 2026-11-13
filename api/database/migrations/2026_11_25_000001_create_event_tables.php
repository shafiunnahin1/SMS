<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D213 CAL.2: events and their registrations (schema.sql `institution_events` incl. the later `is_public`, `event_registrations`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('institution_events', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->string('title', 150);
            $t->text('description')->nullable();
            $t->enum('type', ['academic', 'sports', 'cultural', 'religious', 'other'])->nullable()->default('other');
            $t->date('event_date');
            $t->time('start_time')->nullable();
            $t->time('end_time')->nullable();
            $t->string('venue', 150)->nullable();
            $t->enum('target_audience', ['all', 'students', 'teachers', 'parents'])->nullable()->default('all');
            $t->json('program_ids')->nullable();
            $t->boolean('registration_required')->nullable()->default(0);
            $t->date('registration_deadline')->nullable();
            $t->integer('max_participants')->nullable();
            $t->unsignedBigInteger('created_by')->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->boolean('is_public')->default(0);
            $t->index(['institution_id', 'event_date'], 'idx_events_date');
        });
        Schema::create('event_registrations', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('event_id');
            $t->unsignedBigInteger('student_id');
            $t->timestamp('registered_at')->nullable()->useCurrent();
            $t->enum('status', ['registered', 'attended', 'absent'])->nullable()->default('registered');
            $t->unique(['event_id', 'student_id'], 'unique_reg');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('event_registrations');
        Schema::dropIfExists('institution_events');
    }
};

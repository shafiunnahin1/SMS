<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('staff_members', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('institution_id'); $t->unsignedBigInteger('user_id')->nullable();
            $t->string('employee_id', 20); $t->string('name', 100);
            $t->string('designation', 80)->nullable(); $t->string('department', 80)->nullable();
            $t->string('phone', 20)->nullable(); $t->string('photo', 255)->nullable();
            $t->date('joining_date')->nullable(); $t->date('leaving_date')->nullable();
            $t->enum('status', ['active','inactive','on_leave'])->default('active');
            $t->timestamp('created_at')->useCurrent(); $t->softDeletes();
            $t->unique(['institution_id','employee_id'], 'unique_staff_code');
            $t->foreign('institution_id')->references('id')->on('institutions');
        });
        foreach (['staff' => 'staff_members', 'teacher' => 'teachers'] as $type => $parent) {
            Schema::create($type.'_attendances', function (Blueprint $t) use ($type, $parent) {
                $t->id(); $t->unsignedBigInteger('institution_id'); $t->unsignedBigInteger($type.'_id');
                $t->date('date'); $t->enum('status', ['present','absent','late','leave']);
                $t->time('check_in')->nullable(); $t->time('check_out')->nullable();
                $t->string('note', 255)->nullable(); $t->unsignedBigInteger('marked_by')->nullable();
                if ($type === 'teacher') $t->timestamp('created_at')->useCurrent();
                $t->unique(['institution_id', $type.'_id','date'], 'unique_'.$type.'_attendance');
                $t->foreign('institution_id')->references('id')->on('institutions');
                $t->foreign($type.'_id')->references('id')->on($parent);
            });
        }
        Schema::create('leave_types', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('institution_id'); $t->string('name', 50);
            $t->integer('max_days_per_year')->nullable()->default(10);
            $t->boolean('is_paid')->nullable()->default(true);
            $t->index('institution_id', 'idx_leave_types_inst');
        });
        Schema::create('leave_applications', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('user_id')->nullable(); $t->unsignedBigInteger('staff_id')->nullable();
            $t->unsignedBigInteger('leave_type_id'); $t->date('from_date'); $t->date('to_date');
            $t->integer('total_days'); $t->text('reason')->nullable();
            $t->enum('status', ['pending','approved','rejected','cancelled'])->nullable()->default('pending');
            $t->unsignedBigInteger('approved_by')->nullable(); $t->timestamp('created_at')->useCurrent();
            $t->foreign('user_id')->references('id')->on('users');
            $t->index(['institution_id','status'], 'idx_leave_inst_status');
            $t->index(['institution_id','user_id','leave_type_id','status','from_date'], 'idx_leave_balance_actor');
        });
    }
    public function down(): void
    {
        foreach (['leave_applications','leave_types','teacher_attendances','staff_attendances','staff_members'] as $table) Schema::dropIfExists($table);
    }
};

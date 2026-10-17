<?php

namespace Database\Factories;

use App\Models\TeacherAttendance;
use Illuminate\Database\Eloquent\Factories\Factory;

class TeacherAttendanceFactory extends Factory
{
    protected $model = TeacherAttendance::class;
    public function definition(): array
    {
        return ['teacher_id' => fn () => \App\Models\Teacher::first()?->id ?? \App\Models\Teacher::create([
                'user_id' => \App\Models\User::create(['institution_id' => \App\Support\Tenancy::current()->id, 'role' => 'teacher', 'name' => 'Teacher fixture', 'email' => fake()->unique()->safeEmail(), 'password' => 'Fixture@1234', 'is_active' => true])->id,
                'employee_id' => fake()->unique()->numerify('T########')])->id, 'date' => '2026-10-18', 'status' => 'present'];
    }
}

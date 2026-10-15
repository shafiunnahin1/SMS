<?php
namespace Database\Seeders;
use App\Services\{ModuleGate};
use App\Services\Hr\SalaryComponentService;
use App\Support\Tenancy;
use Illuminate\Database\Seeder;
class SalaryComponentSeeder extends Seeder
{
    public function run(): void
    {
        Tenancy::each(function($institution){
            if(app(ModuleGate::class)->allows($institution,'hr_payroll')) app(SalaryComponentService::class)->seedDefaults();
        });
    }
}

<?php

namespace App\Console\Commands;

use App\Models\Institution;
use App\Services\Library\LibraryService;
use App\Services\ModuleGate;
use App\Support\Tenancy;
use Illuminate\Console\Command;

// D227 (8) library:overdue - daily: issues past their due date become overdue once, with one in-app notice to the student and parents
class LibraryOverdue extends Command
{
    protected $signature = 'library:overdue';
    protected $description = 'Mark overdue library books once and notify the student and the parents in the app';

    public function handle(LibraryService $library, ModuleGate $gate): int
    {
        Tenancy::each(function (Institution $i) use ($library, $gate) {
            if ($gate->allows($i, 'library')) $library->markOverdue();
        });
        return self::SUCCESS;
    }
}

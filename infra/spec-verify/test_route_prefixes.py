"""D88: generated routes must retain Laravel static and chained group prefixes."""
import unittest
from unittest.mock import patch

import gen_agent_plan as plan


class RoutePrefixTest(unittest.TestCase):
    def test_paths_are_relative_to_outer_api_version(self):
        source = """
Route::prefix('v1')->group(function () {
    Route::prefix('admin')->group(function () {
        Route::post('/staff', [StaffAccountController::class, 'store']);
    });
});
"""
        with patch.object(plan, 'rt', source):
            self.assertEqual(plan.routes()[0][1], '/admin/staff')

    def test_static_nested_prefix_and_resource_keep_admin_path_and_role(self):
        source = """
Route::middleware('role:admin')->group(function () {
    Route::prefix('admin')->group(function () {
        Route::apiResource('staff', StaffAccountController::class)->except(['show', 'destroy']);
        Route::post('/departments/{department}/duties', [DepartmentDutyController::class, 'store']);
    });
    Route::get('/outside', [StaffAccountController::class, 'index']);
});
"""
        with patch.object(plan, 'rt', source):
            routes = plan.routes()
        self.assertEqual([(r[0], r[1], r[4]) for r in routes], [
            ('GET', '/admin/staff', 'admin'),
            ('POST', '/admin/staff', 'admin'),
            ('PUT', '/admin/staff/{id}', 'admin'),
            ('POST', '/admin/departments/{department}/duties', 'admin'),
            ('GET', '/outside', 'admin'),
        ])

    def test_chained_prefix_and_module_are_retained(self):
        source = """
Route::middleware(['role:admin', 'module:hr_payroll'])->prefix('hr')->group(function () {
    Route::get('/advances', [SalaryAdvanceController::class, 'index']);
});
"""
        with patch.object(plan, 'rt', source):
            self.assertEqual(plan.routes(), [
                ('GET', '/hr/advances', 'SalaryAdvanceController', 'index', 'admin', 'hr_payroll'),
            ])


if __name__ == '__main__':
    unittest.main()

import { test, expect } from '@playwright/test'
import { login, tenantOf, watchConsole } from './helpers.js'

// Step 4.3 on all three demo tenants (school, coaching, private batch): the admin takes today's attendance with "all present",
// marks one student absent, saves, and the month report shows the batch.
test('4.3 attendance: take with all present, then the month report', async ({ page }, testInfo) => {
  const noErrors = watchConsole(page)
  const tenant = tenantOf(testInfo)
  await login(page, ...tenant.admin)
  await page.goto('/admin/attendance')
  if (tenant.batch) await page.locator('main select').first().selectOption({ label: tenant.batch })   // the school's seeded students sit in Class 10-A
  const markAll = page.locator('[data-action="markAll"]')
  await markAll.click()
  await page.locator('[data-row]').first().getByRole('radio', { name: /অনুপস্থিত/ }).click()
  await page.locator('[data-action="save"]').click()
  await expect(page.getByText(/উপস্থিতি সংরক্ষিত/)).toBeVisible()      // the save toast

  await page.getByRole('tab', { name: 'মাসিক রিপোর্ট' }).click()
  await expect(page.locator('[data-testid="attendance-report"]')).toContainText('%')
  noErrors()
})

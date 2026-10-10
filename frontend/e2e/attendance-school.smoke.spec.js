import { test, expect } from '@playwright/test'
import { login, watchConsole } from './helpers.js'

// Step 4.3 Done When (school): the demo teacher takes attendance in their own batch (Class 10-A) and marks "ছাত্র 1" absent;
// that child's demo parent (01900000001) sees the absence on /parent/attendance. Only the school project runs this file.
test('4.3 teacher takes their batch, the parent sees the absence', async ({ page, browser }, testInfo) => {
  const noErrors = watchConsole(page)
  await login(page, 'teacher@dhanmondischool.edu.bd', 'Teacher@1234')
  await page.goto('/teacher/attendance')
  await page.locator('[data-action="markAll"]').click()
  const row = page.locator('[data-row]').filter({ has: page.getByText('ছাত্র 1', { exact: true }) })
  await row.getByRole('radio', { name: /অনুপস্থিত/ }).click()
  await page.locator('[data-action="save"]').click()
  await expect(page.getByText(/উপস্থিতি সংরক্ষিত/)).toBeVisible()
  noErrors()

  const parent = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage()
  const parentErrors = watchConsole(parent)
  await login(parent, '01900000001', 'Parent@1234')
  await parent.goto('/parent/attendance')
  await parent.getByRole('tab', { name: 'ছাত্র 1', exact: true }).click()
  await expect(parent.locator('[data-testid="parent-attendance-days"] [data-status="absent"]').first()).toBeVisible()
  parentErrors()
})

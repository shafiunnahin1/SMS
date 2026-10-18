import { test, expect } from '@playwright/test'
import { login, tenantOf, watchConsole } from './helpers.js'

// Step 4.8 on all three demo tenants: the admin opens the class list as a PDF and downloads the fee collection as Excel
test('4.8 reports: class list PDF and collection Excel', async ({ page }, testInfo) => {
  const noErrors = watchConsole(page)
  await login(page, ...tenantOf(testInfo).admin)
  await page.goto('/admin/reports')

  const pdf = page.waitForResponse(r => r.url().includes('/api/v1/admin/reports/students'))
  const popup = page.waitForEvent('popup')
  await page.locator('[data-action="pdf"]').click()
  const res = await pdf
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('application/pdf')
  await (await popup).close()

  await page.getByRole('tab', { name: 'ফি আদায়' }).click()
  const download = page.waitForEvent('download')
  await page.locator('[data-action="xlsx"]').click()
  expect((await download).suggestedFilename()).toBe('fees.xlsx')
  noErrors()
})

import { test, expect } from '@playwright/test'
import { login, tenantOf, watchConsole } from './helpers.js'

// F1: admin login -> dashboard in the tenant's own theme and layout; no console errors
test('F1 admin logs in and lands on the dashboard of their layout', async ({ page }, testInfo) => {
  const t = tenantOf(testInfo)
  const noErrors = watchConsole(page)
  await login(page, ...t.admin)
  await expect(page).toHaveURL(/\/admin\/dashboard/)
  await expect(page.locator(`[data-layout="${t.layout}"]`)).toBeVisible()
  await expect(page.locator('[data-testid="app-topbar"]')).toBeVisible()
  const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim())
  expect(primary).not.toBe('')                      // the institution's colour reached the page (ThemeProvider)
  noErrors()
})

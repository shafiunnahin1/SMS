import { test, expect } from '@playwright/test'
import { login, tenantOf, watchConsole } from './helpers.js'

// F1: admin login -> dashboard in the tenant's own theme and layout; no console errors
test('F1 admin logs in and lands on the dashboard of their layout', async ({ page }, testInfo) => {
  const t = tenantOf(testInfo)
  const noErrors = watchConsole(page)
  await login(page, ...t.admin, { fresh: true })
  await expect(page).toHaveURL(/\/admin\/dashboard/)
  await expect(page.locator(`[data-layout="${t.layout}"]`)).toBeVisible()
  await expect(page.locator('[data-testid="app-topbar"]')).toBeVisible()
  const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim())
  expect(primary).not.toBe('')                      // the institution's colour reached the page (ThemeProvider)
  noErrors()
})

// Step 8.1 (D27): the privacy policy and the terms open from the sign-in screen, without a login; the draft banner shows until
// the lawyer's text replaces public/legal/*.md
test('8.1 privacy and terms pages render the owner text', async ({ page }) => {
  const noErrors = watchConsole(page)
  await page.goto('/login')
  await page.locator('[data-testid="legal-links"] a[href="/privacy"]').click()
  await expect(page.locator('[data-testid="legal-privacy"] h1')).toBeVisible()
  await expect(page.locator('[data-testid="legal-draft"]')).toBeVisible()
  await page.locator('nav a[href="/terms"]').last().click()
  await expect(page.locator('[data-testid="legal-terms"] h1')).toBeVisible()
  noErrors()
})

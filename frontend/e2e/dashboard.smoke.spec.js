import { test, expect } from '@playwright/test'
import { login, tenantOf, watchConsole } from './helpers.js'

// Step 4.7 on all three demo tenants: the admin dashboard loads its numbers; the private-batch tutor (mobile-compact layout)
// gets the 5-tab bottom bar - 4 primary items + "More" (docs/modules/coaching-private-batch.md "Lite Mode").
test('4.7 admin dashboard, and the tutor bottom bar has five tabs', async ({ page }, testInfo) => {
  const noErrors = watchConsole(page)
  const tenant = tenantOf(testInfo)
  await login(page, ...tenant.admin)
  await page.goto('/admin/dashboard')
  await expect(page.locator('[data-testid="dashboard-collection"]')).toContainText('৳')
  if (tenant.layout === 'mobile-compact') {
    const tabs = page.locator('[data-testid="app-nav"] > ul > li')
    await expect(tabs).toHaveCount(5)
    await expect(tabs.last()).toContainText(/আরও|More/)
  }
  noErrors()
})

import { test, expect } from '@playwright/test'
import { login, watchConsole } from './helpers.js'
import { TENANTS } from '../playwright.config.js'

// Step 4.7 Done When (school): every role logs in, sees its dashboard and opens EVERY item of its menu - no 404, no console
// error, no failed API call (an unbuilt screen shows NotBuilt). Only the school project runs this file.
const ROLES = [
  ['admin', TENANTS.school.admin],
  ['teacher', ['teacher@dhanmondischool.edu.bd', 'Teacher@1234']],
  ['accountant', ['accountant@dhanmondischool.edu.bd', 'Accountant@1234']],
  ['parent', ['01900000001', 'Parent@1234']],
]

for (const [role, creds] of ROLES) {
  test(`4.7 ${role}: dashboard and every menu item open`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const page = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage()
    const noErrors = watchConsole(page)
    await login(page, ...creds)
    await page.goto(`/${role}/dashboard`)
    const consent = page.locator('[data-testid="consent-screen"]')
    await expect(consent.or(page.locator('[data-testid="dashboard"]'))).toBeVisible()
    if (await consent.isVisible()) {                    // a parent's first visit: the privacy screen comes before the dashboard
      await consent.locator('[data-consent="data_processing"]').check()
      await consent.locator('[data-testid="consent-save"]').click()
    }
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible()
    await expect(page.locator('[data-testid="dashboard"] [role="alert"], [data-testid="dashboard"] [data-state="error"]')).toHaveCount(0)

    const nav = page.locator('[data-testid="app-nav"]')
    const hrefs = [...new Set(await nav.locator('a[href]').evaluateAll(as => as.map(a => a.getAttribute('href'))))].filter(h => h.startsWith(`/${role}`))
    expect(hrefs.length).toBeGreaterThan(1)
    for (const href of hrefs) {
      await page.goto(href)
      await page.waitForLoadState('networkidle')
      await expect(page, href).not.toHaveURL(/\/login/)
      await expect(page.locator('main'), href).not.toContainText('404')
    }
    noErrors()
  })
}

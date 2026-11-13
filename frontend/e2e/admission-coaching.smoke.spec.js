import { test, expect } from '@playwright/test'
import { login, tenantOf, watchConsole } from './helpers.js'

// D204 GAP.4 (coaching demo only - its public website is on; playwright.config.js keeps it off the other tenants): a 360 px visitor
// applies on the public admission form; the admin finds the application on the leads screen.

test('GAP.4 admission: a public application reaches the admin leads screen', async ({ page, browser }, testInfo) => {
  const tenant = tenantOf(testInfo)
  const name = `E2E আবেদনকারী ${Date.now() % 1000000}`
  const visitor = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL, locale: 'bn-BD', viewport: { width: 360, height: 740 } })).newPage()
  const visitorErrors = watchConsole(visitor)
  await visitor.goto('/admission')
  const form = visitor.locator('[data-testid="admission-form"]')
  await expect(form).toBeVisible({ timeout: 20000 })
  await form.getByLabel(/আবেদনকারীর নাম|Applicant's name/).fill(name)
  await form.getByLabel(/মোবাইল|Mobile/).fill('016' + String(Date.now()).slice(-8))
  await form.getByRole('checkbox').check()
  const answer = visitor.waitForResponse(r => r.url().includes('/api/v1/public/admission'))
  await form.getByRole('button', { name: /আবেদন জমা দিন|Submit application/ }).click()
  // the form is limited per institution and address (PUBLIC_ADMISSION_RATE_PER_HOUR, default 5): repeated local runs hit it
  expect((await answer).status(), 'the admission limit of this server was reached (PUBLIC_ADMISSION_RATE_PER_HOUR)').not.toBe(429)
  await expect(visitor.locator('[data-testid="admission-done"]')).toBeVisible({ timeout: 15000 })
  visitorErrors()

  const noErrors = watchConsole(page)
  await login(page, ...tenant.admin)
  await page.goto('/admin/leads?source=website')
  await expect(page.locator('[data-testid="lead"]', { hasText: name })).toBeVisible({ timeout: 20000 })
  noErrors()
})

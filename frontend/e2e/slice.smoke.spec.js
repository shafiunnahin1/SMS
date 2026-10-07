import { test, expect } from '@playwright/test'
import { login, watchConsole } from './helpers.js'
import { TENANTS } from '../playwright.config.js'

// F2 (walking skeleton): admission -> cash fee collection -> receipt -> the parent sees the same receipt. Runs on the school tenant:
// its demo parent (01900000001) is linked by the guardian phone, so the new child appears in that parent's account.
// Only the school project runs this file (playwright.config.js testIgnore); F1 covers the three themes.
test('F2 admission, fee, receipt and the parent sees it', async ({ page, browser }, testInfo) => {
  const noErrors = watchConsole(page)
  const name = `E2E ${Date.now()}`

  await login(page, ...TENANTS.school.admin)
  await page.goto('/admin/students/add')
  const form = page.locator('form')
  await form.locator('input').nth(0).fill(name)
  await form.locator('input').nth(1).fill('01900000001')
  await form.locator('select').first().selectOption({ index: 1 })
  await form.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/admin\/students$/)

  await page.goto('/admin/fees/collect')
  await page.locator('input[type="search"]').fill(name)
  await page.locator('[data-testid="student-results"] button', { hasText: name }).click()
  const dues = page.locator('[data-testid="dues-card"]')
  await dues.locator('input[type="checkbox"]').first().check()
  await page.locator('[data-testid="collect"]').click()
  const receipt = page.locator('[data-testid="receipt-card"]')
  await expect(receipt).toBeVisible()
  const receiptNo = (await receipt.locator('p').first().textContent()).match(/RCP-\d{4}-\d{5}/)[0]
  noErrors()

  const parent = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage()
  await login(parent, '01900000001', 'Parent@1234')
  await parent.goto('/parent/fees')
  await parent.getByRole('tab', { name }).click()
  await expect(parent.locator('[data-testid="parent-receipts"]')).toContainText(receiptNo)
})
